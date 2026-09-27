'use strict';

/**
 * ZyrionOS Log Agent
 * Version: 1.0.0
 *
 * Responsibilities:
 *
 * - Deployment log orchestration
 * - Deployment event recording
 * - Error handling
 * - Auto Fix eligibility detection
 * - Auto Fix trigger creation
 * - Auto Fix attempt tracking
 * - Safe deployment-log context preparation
 *
 * Important:
 *
 * This agent DOES NOT call an AI provider directly.
 *
 * AI execution remains the responsibility of Fix Agent
 * through the centralized AI provider architecture.
 */

const deploymentLogService =
  require('../services/deploymentLogService');

const AGENT_NAME = 'logAgent';
const AGENT_VERSION = '1.0.0';

const DEFAULT_AUTO_FIX_MAX_ATTEMPTS = 3;

/* -------------------------------------------------------------------------- */
/* Constants                                                                  */
/* -------------------------------------------------------------------------- */

const AUTO_FIXABLE_ERROR_TYPES = new Set([
  'build',
  'docker',
  'runtime',
  'validation',
  'test',
  'deployment',
  'verification',
  'code',
  'compile',
  'dependency',
]);

const NON_AUTO_FIXABLE_ERROR_TYPES = new Set([
  'billing',
  'payment',
  'subscription',
  'authentication',
  'authorization',
  'credentials',
  'environment_secret',
  'infrastructure_permission',
]);

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function cleanString(value, max = 5000) {
  if (
    value === undefined ||
    value === null
  ) {
    return undefined;
  }

  const result = String(value)
    .replace(/\u0000/g, '')
    .trim();

  return result
    ? result.slice(0, max)
    : undefined;
}

function normalizeId(value) {
  return cleanString(value, 200);
}

function normalizeErrorType(type) {
  return (
    cleanString(type, 100)
      ?.toLowerCase()
      .replace(/\s+/g, '_') ||
    'deployment'
  );
}

function clampAttempts(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return DEFAULT_AUTO_FIX_MAX_ATTEMPTS;
  }

  return Math.max(
    0,
    Math.min(number, 20)
  );
}

function sanitizeObject(value, depth = 0) {
  if (depth > 6) {
    return '[TRUNCATED]';
  }

  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) =>
        sanitizeObject(
          item,
          depth + 1
        )
      );
  }

  if (
    typeof value === 'object'
  ) {
    const result = {};

    for (
      const [
        key,
        child
      ] of Object.entries(value)
    ) {
      const normalizedKey =
        key.toLowerCase();

      if (
        normalizedKey.includes(
          'password'
        ) ||
        normalizedKey.includes(
          'secret'
        ) ||
        normalizedKey.includes(
          'token'
        ) ||
        normalizedKey.includes(
          'credential'
        ) ||
        normalizedKey.includes(
          'api_key'
        ) ||
        normalizedKey.includes(
          'apikey'
        ) ||
        normalizedKey.includes(
          'authorization'
        ) ||
        normalizedKey.includes(
          'environmentvariables'
        ) ||
        normalizedKey.includes(
          'runtimeenvironment'
        ) ||
        normalizedKey.includes(
          'buildenvironment'
        )
      ) {
        result[key] =
          '[REDACTED]';

        continue;
      }

      result[key] =
        sanitizeObject(
          child,
          depth + 1
        );
    }

    return result;
  }

  return String(value)
    .slice(0, 2000);
}

function getErrorMessage(error) {
  if (!error) {
    return 'Unknown deployment error';
  }

  if (
    typeof error === 'string'
  ) {
    return error.slice(0, 5000);
  }

  return (
    cleanString(
      error.message,
      5000
    ) ||
    'Unknown deployment error'
  );
}

/* -------------------------------------------------------------------------- */
/* Log Agent                                                                 */
/* -------------------------------------------------------------------------- */

class LogAgent {
  constructor() {
    this.name = AGENT_NAME;
    this.version = AGENT_VERSION;
  }

  /* ------------------------------------------------------------------------ */
  /* Create Deployment Log                                                   */
  /* ------------------------------------------------------------------------ */

  async createDeploymentLog(
    input = {}
  ) {
    const result =
      await deploymentLogService
        .createDeploymentLog({
          ...input,

          type:
            input.type ||
            'deployment',

          source:
            input.source ||
            AGENT_NAME,
        });

    return {
      success: true,

      agent: AGENT_NAME,

      version: AGENT_VERSION,

      action:
        'create_deployment_log',

      data: result,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Deployment Started                                                      */
  /* ------------------------------------------------------------------------ */

  async deploymentStarted(
    input = {}
  ) {
    const deploymentId =
      normalizeId(
        input.deploymentId
      );

    if (!deploymentId) {
      throw new Error(
        'deploymentId is required'
      );
    }

    const result =
      await deploymentLogService
        .markStarted(
          deploymentId,
          {
            stage:
              input.stage,

            agent:
              input.agent ||
              AGENT_NAME,

            progress:
              input.progress ?? 0,

            status:
              input.status ||
              'running',

            message:
              input.message ||
              'Deployment started',
          }
        );

    return {
      success: true,

      agent: AGENT_NAME,

      action:
        'deployment_started',

      data: result,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Deployment Event                                                        */
  /* ------------------------------------------------------------------------ */

  async recordEvent(
    input = {}
  ) {
    const deploymentId =
      normalizeId(
        input.deploymentId
      );

    if (!deploymentId) {
      throw new Error(
        'deploymentId is required'
      );
    }

    const result =
      await deploymentLogService
        .appendEvent({
          ...input,

          deploymentId,

          source:
            input.source ||
            AGENT_NAME,
        });

    return {
      success: true,

      agent: AGENT_NAME,

      action:
        'record_event',

      data: result,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Deployment Error                                                        */
  /* ------------------------------------------------------------------------ */

  async recordDeploymentError(
    input = {}
  ) {
    const deploymentId =
      normalizeId(
        input.deploymentId
      );

    if (!deploymentId) {
      throw new Error(
        'deploymentId is required'
      );
    }

    const error =
      input.error ||
      input.message ||
      'Deployment failed';

    const errorType =
      normalizeErrorType(
        input.errorType ||
        input.type
      );

    const result =
      await deploymentLogService
        .recordError(
          deploymentId,
          error,
          {
            type:
              errorType,

            event:
              input.event ||
              'deployment_error',

            stage:
              input.stage,

            agent:
              input.agent ||
              AGENT_NAME,

            status:
              input.status ||
              'failed',

            message:
              input.message ||
              getErrorMessage(error),

            details:
              sanitizeObject(
                input.details
              ),
          }
        );

    const autoFix =
      this.evaluateAutoFixEligibility({
        errorType,

        error,

        autoFix:
          input.autoFix,

        attemptCount:
          input.autoFixAttemptCount,

        maxAttempts:
          input.maxAutoFixAttempts,
      });

    let autoFixResult = null;

    if (
      autoFix.eligible
    ) {
      autoFixResult =
        await this.triggerAutoFix({
          deploymentId,

          projectId:
            input.projectId,

          workflowId:
            input.workflowId,

          userId:
            input.userId,

          errorType,

          error,

          stage:
            input.stage,

          agent:
            input.agent,

          details:
            input.details,

          maxAttempts:
            autoFix.maxAttempts,

          reason:
            autoFix.reason,
        });
    }

    return {
      success: true,

      agent: AGENT_NAME,

      action:
        'record_deployment_error',

      data: {
        log: result,

        autoFix: autoFixResult,
      },
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Auto Fix Eligibility                                                     */
  /* ------------------------------------------------------------------------ */

  evaluateAutoFixEligibility(
    input = {}
  ) {
    const errorType =
      normalizeErrorType(
        input.errorType
      );

    const maxAttempts =
      clampAttempts(
        input.maxAttempts
      );

    const attemptCount =
      Number(
        input.attemptCount || 0
      );

    /* ---------------------------------------------------------------------- */
    /* Explicit Disable                                                       */
    /* ---------------------------------------------------------------------- */

    if (
      input.autoFix === false
    ) {
      return {
        eligible: false,

        reason:
          'Auto Fix explicitly disabled',

        errorType,

        attemptCount,

        maxAttempts,
      };
    }

    /* ---------------------------------------------------------------------- */
    /* Attempt Limit                                                          */
    /* ---------------------------------------------------------------------- */

    if (
      attemptCount >=
      maxAttempts
    ) {
      return {
        eligible: false,

        reason:
          'Auto Fix attempt limit reached',

        errorType,

        attemptCount,

        maxAttempts,
      };
    }

    /* ---------------------------------------------------------------------- */
    /* Non-Fixable Errors                                                     */
    /* ---------------------------------------------------------------------- */

    if (
      NON_AUTO_FIXABLE_ERROR_TYPES
        .has(errorType)
    ) {
      return {
        eligible: false,

        reason:
          'Error type requires manual or infrastructure-level intervention',

        errorType,

        attemptCount,

        maxAttempts,
      };
    }

    /* ---------------------------------------------------------------------- */
    /* Explicit Auto Fix                                                      */
    /* ---------------------------------------------------------------------- */

    if (
      input.autoFix === true
    ) {
      return {
        eligible: true,

        reason:
          'Auto Fix explicitly enabled',

        errorType,

        attemptCount,

        maxAttempts,
      };
    }

    /* ---------------------------------------------------------------------- */
    /* Known Fixable Types                                                     */
    /* ---------------------------------------------------------------------- */

    if (
      AUTO_FIXABLE_ERROR_TYPES
        .has(errorType)
    ) {
      return {
        eligible: true,

        reason:
          'Error type is eligible for Auto Fix',

        errorType,

        attemptCount,

        maxAttempts,
      };
    }

    /* ---------------------------------------------------------------------- */
    /* Default                                                                */
    /* ---------------------------------------------------------------------- */

    return {
      eligible: false,

      reason:
        'Error type is not automatically classified as fixable',

      errorType,

      attemptCount,

      maxAttempts,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Auto Fix Trigger                                                        */
  /* ------------------------------------------------------------------------ */

  async triggerAutoFix(
    input = {}
  ) {
    const deploymentId =
      normalizeId(
        input.deploymentId
      );

    if (!deploymentId) {
      throw new Error(
        'deploymentId is required'
      );
    }

    const maxAttempts =
      clampAttempts(
        input.maxAttempts
      );

    const triggerId =
      this.createTriggerId(
        deploymentId
      );

    /* ---------------------------------------------------------------------- */
    /* Mark Eligible                                                          */
    /* ---------------------------------------------------------------------- */

    await deploymentLogService
      .markAutoFixEligible(
        deploymentId,
        {
          reason:
            input.reason ||
            'Deployment error is eligible for Auto Fix',
        }
      );

    /* ---------------------------------------------------------------------- */
    /* Prepare Safe Fix Context                                               */
    /* ---------------------------------------------------------------------- */

    const fixRequest = {
      triggerId,

      deploymentId,

      projectId:
        normalizeId(
          input.projectId
        ),

      workflowId:
        normalizeId(
          input.workflowId
        ),

      userId:
        normalizeId(
          input.userId
        ),

      errorType:
        normalizeErrorType(
          input.errorType
        ),

      stage:
        cleanString(
          input.stage,
          120
        ),

      sourceAgent:
        cleanString(
          input.agent,
          120
        ),

      error: {
        message:
          getErrorMessage(
            input.error
          ),
      },

      details:
        sanitizeObject(
          input.details
        ),

      maxAttempts,

      requestedAt:
        new Date()
          .toISOString(),
    };

    /* ---------------------------------------------------------------------- */
    /* Mark Triggered                                                         */
    /* ---------------------------------------------------------------------- */

    const triggerResult =
      await deploymentLogService
        .markAutoFixTriggered(
          deploymentId,
          {
            autoFixTriggerId:
              triggerId,

            reason:
              input.reason ||
              'Auto Fix trigger created',
          }
        );

    /* ---------------------------------------------------------------------- */
    /* Record Trigger Event                                                   */
    /* ---------------------------------------------------------------------- */

    await deploymentLogService
      .appendEvent({
        deploymentId,

        level: 'info',

        type: 'fix',

        event:
          'auto_fix_requested',

        source:
          AGENT_NAME,

        stage:
          input.stage ||
          'auto_fix',

        agent:
          input.agent ||
          AGENT_NAME,

        status:
          'running',

        message:
          'Auto Fix request created',

        details: {
          triggerId,

          errorType:
            fixRequest.errorType,

          stage:
            fixRequest.stage,

          maxAttempts,

          execution:
            'pending_fix_agent',
        },
      });

    return {
      success: true,

      triggered: true,

      executionStarted: false,

      agent: AGENT_NAME,

      action:
        'trigger_auto_fix',

      triggerId,

      deploymentId,

      fixRequest,

      log: triggerResult,

      nextAction:
        'fix_agent_execution',
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Auto Fix Completed                                                       */
  /* ------------------------------------------------------------------------ */

  async completeAutoFix(
    input = {}
  ) {
    const deploymentId =
      normalizeId(
        input.deploymentId
      );

    if (!deploymentId) {
      throw new Error(
        'deploymentId is required'
      );
    }

    const success =
      input.success === true;

    const result =
      await deploymentLogService
        .appendEvent({
          deploymentId,

          level:
            success
              ? 'success'
              : 'error',

          type:
            'fix',

          event:
            success
              ? 'auto_fix_completed'
              : 'auto_fix_failed',

          source:
            AGENT_NAME,

          stage:
            'auto_fix',

          agent:
            input.agent ||
            'fixAgent',

          status:
            success
              ? 'running'
              : 'failed',

          message:
            input.message ||
            (
              success
                ? 'Auto Fix completed'
                : 'Auto Fix failed'
            ),

          details:
            sanitizeObject(
              input.details
            ),

          error:
            success
              ? undefined
              : input.error,
        });

    return {
      success: true,

      agent: AGENT_NAME,

      action:
        'complete_auto_fix',

      data: result,
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Get Auto Fix Context                                                     */
  /* ------------------------------------------------------------------------ */

  async getAutoFixContext(
    deploymentId
  ) {
    const normalizedDeploymentId =
      normalizeId(
        deploymentId
      );

    if (!normalizedDeploymentId) {
      throw new Error(
        'deploymentId is required'
      );
    }

    const latest =
      await deploymentLogService
        .getLatestDeploymentLog(
          normalizedDeploymentId
        );

    if (!latest) {
      throw new Error(
        'Deployment log not found'
      );
    }

    return {
      success: true,

      agent: AGENT_NAME,

      action:
        'get_auto_fix_context',

      context: {
        deploymentId:
          latest.deploymentId,

        workflowId:
          latest.workflowId,

        projectId:
          latest.projectId,

        userId:
          latest.userId,

        projectName:
          latest.projectName,

        environmentName:
          latest.environmentName,

        branch:
          latest.branch,

        commitSha:
          latest.commitSha,

        status:
          latest.status,

        currentStage:
          latest.currentStage,

        currentAgent:
          latest.currentAgent,

        hasError:
          latest.hasError,

        error:
          latest.error
            ? {
                code:
                  latest.error.code,

                message:
                  latest.error.message,

                type:
                  latest.error.type,

                retryable:
                  latest.error.retryable,

                stage:
                  latest.error.stage,

                agent:
                  latest.error.agent,
              }
            : null,

        autoFixEligible:
          latest.autoFixEligible,

        autoFixTriggered:
          latest.autoFixTriggered,

        autoFixTriggerId:
          latest.autoFixTriggerId,

        autoFixAttemptCount:
          latest.autoFixAttemptCount,

        stages:
          latest.stages,

        progress:
          latest.progress,
      },
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Agent Dispatcher                                                         */
  /* ------------------------------------------------------------------------ */

  async execute(
    input = {}
  ) {
    const action =
      cleanString(
        input.action,
        100
      ) ||
      'record_event';

    try {
      switch (action) {
        case 'create_deployment_log':
          return await this
            .createDeploymentLog(
              input
            );

        case 'deployment_started':
          return await this
            .deploymentStarted(
              input
            );

        case 'record_event':
          return await this
            .recordEvent(
              input
            );

        case 'record_error':
          return await this
            .recordDeploymentError(
              input
            );

        case 'trigger_auto_fix':
          return await this
            .triggerAutoFix(
              input
            );

        case 'complete_auto_fix':
          return await this
            .completeAutoFix(
              input
            );

        case 'get_auto_fix_context':
          return await this
            .getAutoFixContext(
              input.deploymentId
            );

        case 'evaluate_auto_fix':
          return {
            success: true,

            agent: AGENT_NAME,

            action:
              'evaluate_auto_fix',

            data:
              this.evaluateAutoFixEligibility(
                input
              ),
          };

        default:
          throw new Error(
            `Unsupported Log Agent action: ${action}`
          );
      }
    } catch (error) {
      return {
        success: false,

        agent: AGENT_NAME,

        version: AGENT_VERSION,

        action,

        message:
          getErrorMessage(error),
      };
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Trigger ID                                                               */
  /* ------------------------------------------------------------------------ */

  createTriggerId(
    deploymentId
  ) {
    const timestamp =
      Date.now().toString(36);

    const random =
      Math.random()
        .toString(36)
        .slice(2, 10);

    return [
      'autofix',
      cleanString(
        deploymentId,
        100
      ),
      timestamp,
      random,
    ].join('_');
  }

  /* ------------------------------------------------------------------------ */
  /* Health                                                                   */
  /* ------------------------------------------------------------------------ */

  async health() {
    try {
      const serviceHealth =
        await deploymentLogService
          .health();

      return {
        success:
          serviceHealth.success === true,

        agent: AGENT_NAME,

        version:
          AGENT_VERSION,

        service:
          serviceHealth,
      };
    } catch (error) {
      return {
        success: false,

        agent: AGENT_NAME,

        version: AGENT_VERSION,

        message:
          getErrorMessage(error),
      };
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Singleton                                                                  */
/* -------------------------------------------------------------------------- */

const logAgent =
  new LogAgent();

/* -------------------------------------------------------------------------- */
/* Callable Agent API                                                         */
/* -------------------------------------------------------------------------- */

async function executeLogAgent(
  input = {}
) {
  return logAgent.execute(
    input
  );
}

/* -------------------------------------------------------------------------- */
/* Attached API                                                              */
/* -------------------------------------------------------------------------- */

executeLogAgent.execute =
  logAgent.execute.bind(
    logAgent
  );

executeLogAgent.createDeploymentLog =
  logAgent.createDeploymentLog.bind(
    logAgent
  );

executeLogAgent.deploymentStarted =
  logAgent.deploymentStarted.bind(
    logAgent
  );

executeLogAgent.recordEvent =
  logAgent.recordEvent.bind(
    logAgent
  );

executeLogAgent.recordDeploymentError =
  logAgent.recordDeploymentError.bind(
    logAgent
  );

executeLogAgent.evaluateAutoFixEligibility =
  logAgent.evaluateAutoFixEligibility.bind(
    logAgent
  );

executeLogAgent.triggerAutoFix =
  logAgent.triggerAutoFix.bind(
    logAgent
  );

executeLogAgent.completeAutoFix =
  logAgent.completeAutoFix.bind(
    logAgent
  );

executeLogAgent.getAutoFixContext =
  logAgent.getAutoFixContext.bind(
    logAgent
  );

executeLogAgent.health =
  logAgent.health.bind(
    logAgent
  );

executeLogAgent.version =
  AGENT_VERSION;

executeLogAgent.agentName =
  AGENT_NAME;

/* -------------------------------------------------------------------------- */
/* Export                                                                     */
/* -------------------------------------------------------------------------- */

module.exports =
  executeLogAgent;

module.exports.LogAgent =
  LogAgent;

module.exports.AGENT_NAME =
  AGENT_NAME;

module.exports.AGENT_VERSION =
  AGENT_VERSION;
