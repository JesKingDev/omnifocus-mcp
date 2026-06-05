import { createServer, IncomingMessage, ServerResponse, Server as HttpServer } from 'node:http';
import { URL } from 'node:url';
import { createLogger } from './utils/logger.js';
import { SessionManager } from './session-manager.js';
import { randomUUID } from 'node:crypto';
import { getVersionInfo } from './utils/version.js';
import { validateTokenSet } from './auth/token-registry.js';
import type { TokenEntry } from './auth/token-registry.js';
import { resolveHttpIdentity } from './auth/role-resolver.js';
import type { ResolvedContext } from './contracts/roles.js';

const logger = createLogger('http-server');

// ---------------------------------------------------------------------------
// Exported pure functions for DNS-rebinding protection (HTTP-03, D-14, D-15)
// Exported so unit tests can validate without a live HTTP server instance.
// ---------------------------------------------------------------------------

/**
 * Builds the set of allowed Host/Origin values for a given port and optional
 * extra hostnames. Always includes bare and port-suffixed loopback entries.
 */
export function buildAllowedHostSet(port: number, allowedHosts: string[]): Set<string> {
  const set = new Set<string>();
  // Loopback entries are always allowed (D-15)
  set.add('localhost');
  set.add('127.0.0.1');
  set.add(`localhost:${port}`);
  set.add(`127.0.0.1:${port}`);
  // Caller-supplied extra hosts (MCP_ALLOWED_HOSTS entries)
  for (const h of allowedHosts) {
    if (h) set.add(h);
  }
  return set;
}

/**
 * Returns true if the given Host header value is present in the allowlist.
 * Returns false when the host is undefined (missing Host header).
 */
export function isHostAllowed(host: string | undefined, allowedSet: Set<string>): boolean {
  if (!host) return false;
  return allowedSet.has(host);
}

export class HttpServerManager {
  private httpServer: HttpServer;
  private sessionManager: SessionManager;
  private port: number;
  private host: string;
  private readonly tokenRegistry: ReadonlyMap<string, TokenEntry>;
  private readonly allowedHosts: string[];

  constructor(
    sessionManager: SessionManager,
    port: number,
    host: string,
    tokenRegistry: ReadonlyMap<string, TokenEntry>,
    allowedHosts: string[] = [],
  ) {
    this.sessionManager = sessionManager;
    this.port = port;
    this.host = host;
    this.tokenRegistry = tokenRegistry;
    this.allowedHosts = allowedHosts;

    // Create HTTP server
    this.httpServer = createServer(this.handleRequest.bind(this));

    // Handle server errors
    this.httpServer.on('error', (error) => {
      logger.error('HTTP server error:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
    });

    // Handle server listening
    this.httpServer.on('listening', () => {
      const address = this.httpServer.address();
      logger.info('HTTP server listening', {
        port: this.port,
        host: this.host,
        address: typeof address === 'object' ? address : undefined,
      });
    });

    // Handle server close
    this.httpServer.on('close', () => {
      logger.info('HTTP server closed');
    });
  }

  /**
   * Starts the HTTP server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.httpServer.listen(this.port, this.host, () => {
          logger.info('HTTP server started successfully', {
            port: this.port,
            host: this.host,
          });
          resolve();
        });
      } catch (error) {
        logger.error('Failed to start HTTP server', {
          error: error instanceof Error ? error.message : String(error),
        });
        reject(error);
      }
    });
  }

  /**
   * Stops the HTTP server gracefully
   */
  async stop(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.httpServer.listening) {
        logger.info('HTTP server not running, skip stopping');
        resolve();
        return;
      }

      this.httpServer.close((error) => {
        if (error) {
          logger.error('Error stopping HTTP server', {
            error: error instanceof Error ? error.message : String(error),
          });
          reject(error);
        } else {
          logger.info('HTTP server stopped successfully');
          resolve();
        }
      });
    });
  }

  /**
   * Returns true if the request's Host and Origin headers are in the allowlist.
   * Both must pass when present. Options requests are also gated (Pitfall 4 guard).
   */
  private validateHostOrigin(req: IncomingMessage): boolean {
    const allowedSet = buildAllowedHostSet(this.port, this.allowedHosts);

    // Validate Host header
    const host = req.headers['host'];
    if (!isHostAllowed(host, allowedSet)) {
      return false;
    }

    // Validate Origin header when present
    const origin = req.headers['origin'];
    if (origin) {
      let originHost: string;
      try {
        originHost = new URL(origin).host;
      } catch {
        // Malformed Origin → deny (D-14)
        return false;
      }
      if (!isHostAllowed(originHost, allowedSet)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Builds the CORS Access-Control-Allow-Origin header value.
   * Reflects the request Origin if it is in the allowlist, otherwise
   * defaults to 'http://localhost' for loopback-only deployments.
   * This avoids a wildcard '*' for credentialed contexts (D-15 commentary).
   */
  private buildCorsOriginHeader(req: IncomingMessage): string {
    const origin = req.headers['origin'];
    if (origin) {
      try {
        const originHost = new URL(origin).host;
        const allowedSet = buildAllowedHostSet(this.port, this.allowedHosts);
        if (isHostAllowed(originHost, allowedSet)) {
          return origin;
        }
      } catch {
        // Malformed Origin — fall through to default
      }
    }
    return 'http://localhost';
  }

  /**
   * Handles incoming HTTP requests
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    try {
      const startTime = Date.now();
      const requestId = randomUUID();

      logger.debug('Incoming request', {
        requestId,
        method: req.method,
        url: req.url,
        headers: this.getSafeHeaders(req.headers),
      });

      // DNS-rebinding protection: validate Host/Origin before any other processing
      // (Pitfall 4: OPTIONS is also gated here, before the OPTIONS check below)
      if (!this.validateHostOrigin(req)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request', message: 'Host/Origin not in allowlist' }));
        return;
      }

      // Handle CORS preflight requests
      if (req.method === 'OPTIONS') {
        this.handleOptionsRequest(req, res);
        return;
      }

      // Unconditional bearer auth (D-07): every request must carry a valid token
      const tokenEntry = this.resolveTokenFromHeader(req);
      if (!tokenEntry) {
        logger.warn('Unauthorized request', { requestId });
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Unauthorized', message: 'Valid bearer token required' }));
        return;
      }

      // Parse URL to handle query strings and trailing slashes
      const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      const pathname = parsedUrl.pathname.replace(/\/$/, '') || '/';

      // Route requests based on pathname
      switch (pathname) {
        case '/mcp':
          await this.handleMcpRequest(req, res, requestId, tokenEntry);
          break;
        case '/health':
          this.handleHealthRequest(req, res);
          break;
        case '/sessions':
          this.handleSessionsRequest(req, res);
          break;
        default:
          this.handleNotFoundRequest(req, res);
          break;
      }

      const duration = Date.now() - startTime;
      logger.debug('Request completed', {
        requestId,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    } catch (error) {
      logger.error('Error handling request', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Request processing failed' }));
    }
  }

  /**
   * Handles OPTIONS requests for CORS
   */
  private handleOptionsRequest(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Access-Control-Allow-Origin': this.buildCorsOriginHeader(req),
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, MCP-Session-Id, MCP-Protocol-Version',
      'Access-Control-Max-Age': '86400',
      'Content-Length': '0',
    });
    res.end();
  }

  /**
   * Extracts and validates the bearer token from the Authorization header.
   * Returns the matched TokenEntry on success, or null if the header is absent,
   * malformed, or the token does not match any configured entry (constant-time, D-04).
   */
  private resolveTokenFromHeader(req: IncomingMessage): TokenEntry | null {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return null;
    const match = /^Bearer\s+(\S+)$/i.exec(authHeader);
    if (!match?.[1]) return null;
    return validateTokenSet(match[1], this.tokenRegistry);
  }

  /**
   * Handles MCP endpoint requests
   */
  private async handleMcpRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    requestId: string,
    tokenEntry: TokenEntry,
  ): Promise<void> {
    const sessionId = _req.headers['mcp-session-id'] as string | undefined;

    // Handle different HTTP methods for MCP endpoint
    switch (_req.method) {
      case 'POST':
        await this.handleMcpPostRequest(_req, res, sessionId, requestId, tokenEntry);
        break;
      case 'GET':
        await this.handleMcpGetRequest(_req, res, sessionId, requestId);
        break;
      case 'DELETE':
        await this.handleMcpDeleteRequest(_req, res, sessionId, requestId);
        break;
      default:
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'Only POST, GET, and DELETE are supported' }));
        break;
    }
  }

  /**
   * Handles POST requests to /mcp endpoint
   */
  private async handleMcpPostRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
    requestId: string,
    tokenEntry: TokenEntry,
  ): Promise<void> {
    try {
      // Parse request body
      let body: unknown;
      try {
        body = await this.parseRequestBody(_req);
      } catch (error) {
        if (error instanceof Error && error.message === 'PAYLOAD_TOO_LARGE') {
          logger.warn('Request body too large', { requestId });
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload Too Large', message: 'Request body exceeds maximum size' }));
          return;
        }
        throw error;
      }
      if (!body) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Bad Request', message: 'Request body is required' }));
        return;
      }

      let session = sessionId ? this.sessionManager.getSession(sessionId) : undefined;

      // Create new session if no session ID provided or session doesn't exist
      if (!session) {
        const newSessionId = randomUUID();
        // Wire per-session role from the validated token entry (D-12, D-10)
        const identity = resolveHttpIdentity(tokenEntry);
        const context: ResolvedContext = { identity, role: tokenEntry.role };
        session = await this.sessionManager.createSession(newSessionId, tokenEntry.role, context);
        logger.info('Created new session for request', { requestId, sessionId: newSessionId });
      }

      // Handle the request using the session's transport
      await session.transport.handleRequest(_req, res, body);

      // Update session activity
      this.sessionManager.updateSessionActivity(session.sessionId);
    } catch (error) {
      logger.error('Error handling MCP POST request', {
        requestId,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to process MCP request' }));
    }
  }

  /**
   * Handles GET requests to /mcp endpoint (SSE stream)
   */
  private async handleMcpGetRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
    requestId: string,
  ): Promise<void> {
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: 'Session ID is required for GET requests' }));
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', message: 'Session not found' }));
      return;
    }

    try {
      // Handle the request using the session's transport
      await session.transport.handleRequest(_req, res);
      this.sessionManager.updateSessionActivity(session.sessionId);
    } catch (error) {
      logger.error('Error handling MCP GET request', {
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to process MCP GET request' }));
    }
  }

  /**
   * Handles DELETE requests to /mcp endpoint (session termination)
   */
  private async handleMcpDeleteRequest(
    _req: IncomingMessage,
    res: ServerResponse,
    sessionId: string | undefined,
    requestId: string,
  ): Promise<void> {
    if (!sessionId) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Bad Request', message: 'Session ID is required for DELETE requests' }));
      return;
    }

    const session = this.sessionManager.getSession(sessionId);
    if (!session) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not Found', message: 'Session not found' }));
      return;
    }

    try {
      // Handle the request using the session's transport
      await session.transport.handleRequest(_req, res);
      logger.info('Session terminated via DELETE request', { requestId, sessionId });
    } catch (error) {
      logger.error('Error handling MCP DELETE request', {
        requestId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to process MCP DELETE request' }));
    }
  }

  /**
   * Handles health check requests
   */
  private handleHealthRequest(_req: IncomingMessage, res: ServerResponse): void {
    try {
      const versionInfo = getVersionInfo();
      const healthResponse = {
        status: 'ok',
        version: versionInfo.version,
        timestamp: new Date().toISOString(),
        sessions: this.sessionManager.getSessionCount(),
      };

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthResponse, null, 2));
    } catch (error) {
      logger.error('Error handling health request', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'error', error: 'Internal Server Error' }));
    }
  }

  /**
   * Handles sessions info requests
   */
  private handleSessionsRequest(_req: IncomingMessage, res: ServerResponse): void {
    if (_req.method !== 'GET') {
      res.writeHead(405, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Method Not Allowed', message: 'Only GET is supported' }));
      return;
    }

    try {
      const stats = this.sessionManager.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats, null, 2));
    } catch (error) {
      logger.error('Error handling sessions request', {
        error: error instanceof Error ? error.message : String(error),
      });
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Internal Server Error', message: 'Failed to get session information' }));
    }
  }

  /**
   * Handles 404 Not Found requests
   */
  private handleNotFoundRequest(_req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found', message: 'Endpoint not found' }));
  }

  // Maximum request body size (5MB - generous for JSON-RPC payloads)
  private static readonly MAX_BODY_SIZE = 5 * 1024 * 1024;

  /**
   * Parses request body as JSON with size limit enforcement
   */
  private async parseRequestBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve, reject) => {
      let body = '';
      let size = 0;

      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > HttpServerManager.MAX_BODY_SIZE) {
          req.destroy();
          reject(new Error('PAYLOAD_TOO_LARGE'));
          return;
        }
        body += chunk.toString();
      });

      req.on('end', () => {
        if (!body) {
          resolve(null);
          return;
        }

        try {
          const parsed: unknown = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          logger.debug('Failed to parse request body as JSON', {
            error: error instanceof Error ? error.message : String(error),
          });
          resolve(null);
        }
      });

      req.on('error', (error) => {
        reject(error);
      });
    });
  }

  /**
   * Gets safe headers for logging (redacts sensitive info)
   */
  private getSafeHeaders(headers: IncomingMessage['headers']): Record<string, string> {
    const safeHeaders: Record<string, string> = {};
    const sensitiveHeaders = ['authorization', 'cookie', 'set-cookie'];

    if (headers) {
      for (const [key, value] of Object.entries(headers)) {
        if (typeof value === 'string') {
          if (sensitiveHeaders.includes(key.toLowerCase())) {
            safeHeaders[key] = '[REDACTED]';
          } else {
            safeHeaders[key] = value;
          }
        } else if (Array.isArray(value)) {
          safeHeaders[key] = sensitiveHeaders.includes(key.toLowerCase()) ? '[REDACTED]' : value.join(', ');
        }
      }
    }

    return safeHeaders;
  }

  /**
   * Gets the current server status
   */
  getStatus(): {
    listening: boolean;
    port: number;
    host: string;
    activeSessions: number;
  } {
    return {
      listening: this.httpServer.listening,
      port: this.port,
      host: this.host,
      activeSessions: this.sessionManager.getSessionCount(),
    };
  }
}
