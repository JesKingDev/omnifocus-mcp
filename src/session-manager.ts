import { createLogger } from './utils/logger.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// eslint-disable-next-line sonarjs/deprecation -- Server required until MCP SDK supports inputSchema on McpServer
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { CacheManager } from './cache/CacheManager.js';
import { registerTools } from './tools/index.js';
import { registerPrompts } from './prompts/index.js';
import { setPendingOperationsTracker } from './omnifocus/OmniAutomation.js';
import { getVersionInfo } from './utils/version.js';
import type { Role, ResolvedContext } from './contracts/roles.js';

const logger = createLogger('session-manager');

/**
 * Session configuration
 */
export interface SessionConfig {
  sessionId: string;
  transport: StreamableHTTPServerTransport;
  server: Server; // eslint-disable-line sonarjs/deprecation
  createdAt: Date;
  lastActivity: Date;
  /**
   * Principal of the bearer token that created this session (e.g. 'http-agent',
   * 'http-owner'). The session's tool set is registered for this principal's role,
   * so every later request on this session MUST present the same principal —
   * otherwise a lower-privileged token could ride a higher-privileged session
   * (CR-01 privilege escalation). Enforced in HttpServerManager before dispatch.
   */
  principal: string | null;
  /**
   * Set only by an owner-authenticated call (D-02). Never settable by agent-supplied
   * call arguments. When true, agent create operations bypass the session gate for
   * the duration of this session (PERM-02 "allow all this session" grant).
   */
  allowAllThisSession?: boolean;
}

/**
 * Session Manager manages multiple HTTP sessions
 */
export class SessionManager {
  private sessions: Map<string, SessionConfig>;
  private cacheManager: CacheManager;
  private pendingOperations: Set<Promise<unknown>>;
  private sessionTimeout: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(cacheManager: CacheManager, sessionTimeout: number = 30 * 60 * 1000) {
    this.sessions = new Map();
    this.cacheManager = cacheManager;
    this.pendingOperations = new Set();
    this.sessionTimeout = sessionTimeout;

    // Initialize pending operations tracking
    setPendingOperationsTracker(this.pendingOperations);

    logger.info('SessionManager initialized', {
      sessionTimeoutMinutes: this.sessionTimeout / 60000,
      authMode: 'HTTP auth delegated to token registry',
    });
  }

  /**
   * Starts the session cleanup interval
   */
  startCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.cleanupIdleSessions();
    }, this.sessionTimeout / 2); // Check every half of timeout period

    logger.debug('Session cleanup interval started');
  }

  /**
   * Stops the session cleanup interval
   */
  stopCleanupInterval(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
      logger.debug('Session cleanup interval stopped');
    }
  }

  /**
   * Creates a new session with a unique session ID
   */
  async createSession(sessionId: string, role: Role, context: ResolvedContext): Promise<SessionConfig> {
    logger.info('Creating new session', { sessionId });

    // Create a new transport for this session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => sessionId,
      onsessioninitialized: (id) => {
        logger.debug('Session initialized', { sessionId: id });
      },
      onsessionclosed: (id) => {
        logger.debug('Session closed', { sessionId: id });
        this.removeSession(id);
      },
    });

    // Create a new server instance for this session with MCP 2025-11-25 metadata
    const versionInfo = getVersionInfo();
    // eslint-disable-next-line sonarjs/deprecation
    const server = new Server(
      {
        name: 'omnifocus-mcp-cached',
        version: versionInfo.version,
        description:
          'MCP server for OmniFocus task management with GTD-optimized workflows, analytics, and batch operations',
        websiteUrl: 'https://github.com/kip-d/omnifocus-mcp',
      },
      {
        capabilities: {
          tools: {},
          prompts: {},
        },
      },
    );

    // Register tools and prompts for this session using the per-request role and context
    await registerTools(server, this.cacheManager, this.pendingOperations, role, context);
    registerPrompts(server);

    // Connect the server to the transport
    await server.connect(transport);

    const session: SessionConfig = {
      sessionId,
      transport,
      server,
      createdAt: new Date(),
      lastActivity: new Date(),
      // Bind the session to the creating token's principal (CR-01 guard).
      principal: context.identity.principal,
    };

    this.sessions.set(sessionId, session);
    logger.info('Session created successfully', { sessionId, activeSessions: this.sessions.size });

    return session;
  }

  /**
   * Sets the allowAllThisSession grant for the given session.
   *
   * Throws if the caller's role is not 'owner' — this grant is forge-resistant and
   * may only be set from an owner-authenticated code path (D-02, PERM-02).
   * Throws if the session is not found.
   *
   * @param sessionId The session to grant
   * @param role      The resolved caller role — must be 'owner'
   */
  setAllowAllThisSession(sessionId: string, role: Role): void {
    if (role !== 'owner') {
      throw new Error('Only owner-authenticated callers may set session grant (D-02)');
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }
    session.allowAllThisSession = true;
    logger.info('Session grant set', { sessionId });
  }

  /**
   * Gets a session by ID
   */
  getSession(sessionId: string): SessionConfig | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date(); // Update last activity
    }
    return session;
  }

  /**
   * Removes a session by ID
   */
  async removeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    logger.info('Removing session', { sessionId });

    try {
      // Close the server
      await session.server.close();
      logger.debug('Server closed for session', { sessionId });
    } catch (error) {
      logger.error('Error closing server for session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    try {
      // Close the transport
      await session.transport.close();
      logger.debug('Transport closed for session', { sessionId });
    } catch (error) {
      logger.error('Error closing transport for session', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }

    this.sessions.delete(sessionId);
    logger.info('Session removed successfully', { sessionId, activeSessions: this.sessions.size });
  }

  /**
   * Updates the last activity time for a session
   */
  updateSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = new Date();
    }
  }

  /**
   * Gets all active sessions
   */
  getAllSessions(): SessionConfig[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Gets the number of active sessions
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Cleans up idle sessions that have timed out
   */
  async cleanupIdleSessions(): Promise<void> {
    const now = new Date();
    const timeoutThreshold = new Date(now.getTime() - this.sessionTimeout);
    const idleSessions: string[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastActivity < timeoutThreshold) {
        idleSessions.push(sessionId);
      }
    }

    if (idleSessions.length > 0) {
      logger.info('Cleaning up idle sessions', {
        count: idleSessions.length,
        timeoutMinutes: this.sessionTimeout / 60000,
      });

      for (const sessionId of idleSessions) {
        try {
          await this.removeSession(sessionId);
        } catch (error) {
          logger.error('Error cleaning up idle session', {
            sessionId,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
  }

  /**
   * Closes all sessions gracefully
   */
  async closeAllSessions(): Promise<void> {
    logger.info('Closing all sessions', { count: this.sessions.size });

    const sessionIds = Array.from(this.sessions.keys());
    for (const sessionId of sessionIds) {
      try {
        await this.removeSession(sessionId);
      } catch (error) {
        logger.error('Error closing session during shutdown', {
          sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.stopCleanupInterval();
    logger.info('All sessions closed');
  }

  /**
   * Gets session statistics
   */
  getStats(): {
    activeSessions: number;
    sessionIds: string[];
    sessionTimeoutMinutes: number;
  } {
    return {
      activeSessions: this.sessions.size,
      sessionIds: Array.from(this.sessions.keys()),
      sessionTimeoutMinutes: this.sessionTimeout / 60000,
    };
  }
}
