"use strict";

const https = require("https");

const OPENAI_API_BASE =
  process.env.OPENAI_API_BASE || "https://api.openai.com";

const DEFAULT_TIMEOUT_MS = 15000;

function getApiKey() {
  return (
    process.env.OPENAI_ADMIN_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  ).trim();
}

function isConfigured() {
  return Boolean(getApiKey());
}

function requestJson({
  method = "GET",
  path,
  query = {},
  body,
  timeoutMs = DEFAULT_TIMEOUT_MS,
} = {}) {
  return new Promise((resolve, reject) => {
    const apiKey = getApiKey();

    if (!apiKey) {
      return reject(
        Object.assign(
          new Error("OPENAI_API_KEY_NOT_CONFIGURED"),
          {
            code: "OPENAI_API_KEY_NOT_CONFIGURED",
          }
        )
      );
    }

    const url = new URL(path, OPENAI_API_BASE);

    Object.entries(query || {}).forEach(([key, value]) => {
      if (
        value !== undefined &&
        value !== null &&
        value !== ""
      ) {
        url.searchParams.set(key, String(value));
      }
    });

    const payload =
      body === undefined
        ? null
        : JSON.stringify(body);

    const request = https.request(
      url,
      {
        method,
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          ...(payload
            ? {
                "Content-Length": Buffer.byteLength(
                  payload
                ),
              }
            : {}),
        },
        timeout: timeoutMs,
      },
      (response) => {
        let raw = "";

        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          let data = null;

          try {
            data = raw ? JSON.parse(raw) : null;
          } catch {
            data = null;
          }

          const statusCode = response.statusCode || 0;

          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(
              data?.error?.message ||
                `OPENAI_HTTP_${statusCode}`
            );

            error.code =
              data?.error?.code ||
              `OPENAI_HTTP_${statusCode}`;

            error.statusCode = statusCode;
            error.providerResponse = {
              type: data?.error?.type || null,
              code: data?.error?.code || null,
              statusCode,
            };

            return reject(error);
          }

          resolve({
            statusCode,
            data,
          });
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(
        Object.assign(
          new Error("OPENAI_REQUEST_TIMEOUT"),
          {
            code: "OPENAI_REQUEST_TIMEOUT",
          }
        )
      );
    });

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

function normalizeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function toUnixSeconds(value) {
  const date = normalizeDate(value);

  if (!date) {
    return null;
  }

  return Math.floor(date.getTime() / 1000);
}

function normalizeStatus(error) {
  if (!error) {
    return "available";
  }

  if (
    error.code ===
    "OPENAI_API_KEY_NOT_CONFIGURED"
  ) {
    return "not_configured";
  }

  if (
    error.code === "OPENAI_REQUEST_TIMEOUT" ||
    error.code === "ECONNRESET" ||
    error.code === "ENOTFOUND"
  ) {
    return "unavailable";
  }

  return "error";
}

function normalizeUsageBucket(bucket = {}) {
  const result = {
    provider: "openai",
    source: "openai_usage_api",
    status: "available",
    retrievedAt: new Date(),
    period: {
      start: bucket.start_time
        ? new Date(bucket.start_time * 1000)
        : null,
      end: bucket.end_time
        ? new Date(bucket.end_time * 1000)
        : null,
    },
    requests: null,
    inputTokens: null,
    outputTokens: null,
    totalTokens: null,
    model: bucket.model || null,
    projectId: bucket.project_id || null,
    raw: null,
  };

  const results = Array.isArray(bucket.results)
    ? bucket.results
    : [];

  for (const item of results) {
    if (!item || typeof item !== "object") {
      continue;
    }

    if (
      typeof item.num_model_requests ===
      "number"
    ) {
      result.requests =
        (result.requests || 0) +
        item.num_model_requests;
    }

    if (
      typeof item.input_tokens === "number"
    ) {
      result.inputTokens =
        (result.inputTokens || 0) +
        item.input_tokens;
    }

    if (
      typeof item.output_tokens === "number"
    ) {
      result.outputTokens =
        (result.outputTokens || 0) +
        item.output_tokens;
    }

    if (
      typeof item.input_cached_tokens ===
      "number"
    ) {
      result.cachedInputTokens =
        (result.cachedInputTokens || 0) +
        item.input_cached_tokens;
    }
  }

  if (
    result.inputTokens !== null ||
    result.outputTokens !== null
  ) {
    result.totalTokens =
      (result.inputTokens || 0) +
      (result.outputTokens || 0);
  }

  return result;
}

async function health() {
  if (!isConfigured()) {
    return {
      provider: "openai",
      status: "not_configured",
      available: false,
      source: "openai_api",
      retrievedAt: new Date(),
    };
  }

  try {
    /*
     * Models endpoint is used only as a connectivity /
     * authentication check. No model data is treated
     * as financial usage.
     */
    await requestJson({
      method: "GET",
      path: "/v1/models",
    });

    return {
      provider: "openai",
      status: "available",
      available: true,
      source: "openai_api",
      retrievedAt: new Date(),
    };
  } catch (error) {
    return {
      provider: "openai",
      status: normalizeStatus(error),
      available: false,
      source: "openai_api",
      retrievedAt: new Date(),
      error: {
        code: error.code || "OPENAI_HEALTH_CHECK_FAILED",
        message: error.message || "OpenAI unavailable",
      },
    };
  }
}

async function getUsage({
  start,
  end,
  bucketWidth = "1d",
  projectId,
  limit = 100,
} = {}) {
  if (!isConfigured()) {
    return {
      provider: "openai",
      status: "not_configured",
      available: false,
      observations: [],
      source: "openai_usage_api",
      retrievedAt: new Date(),
    };
  }

  const startTime = toUnixSeconds(start);
  const endTime = toUnixSeconds(end);

  const query = {
    bucket_width: bucketWidth,
    limit: Math.min(
      Math.max(Number(limit) || 100, 1),
      1000
    ),
  };

  if (startTime !== null) {
    query.start_time = startTime;
  }

  if (endTime !== null) {
    query.end_time = endTime;
  }

  if (projectId) {
    query.project_ids = projectId;
  }

  try {
    const response = await requestJson({
      method: "GET",
      path: "/v1/organization/usage/completions",
      query,
    });

    const buckets = Array.isArray(
      response.data?.data
    )
      ? response.data.data
      : [];

    const observations = buckets.map(
      normalizeUsageBucket
    );

    return {
      provider: "openai",
      status: "available",
      available: true,
      source: "openai_usage_api",
      retrievedAt: new Date(),
      observations,
      rawMeta: {
        object:
          response.data?.object || null,
        hasMore:
          response.data?.has_more ?? null,
        nextPage:
          response.data?.next_page || null,
      },
    };
  } catch (error) {
    return {
      provider: "openai",
      status: normalizeStatus(error),
      available: false,
      observations: [],
      source: "openai_usage_api",
      retrievedAt: new Date(),
      error: {
        code:
          error.code ||
          "OPENAI_USAGE_REQUEST_FAILED",
        message:
          error.message ||
          "Unable to retrieve OpenAI usage",
        statusCode: error.statusCode || null,
      },
    };
  }
}

async function getCosts({
  start,
  end,
  bucketWidth = "1d",
  limit = 100,
} = {}) {
  if (!isConfigured()) {
    return {
      provider: "openai",
      status: "not_configured",
      available: false,
      observations: [],
      source: "openai_cost_api",
      retrievedAt: new Date(),
    };
  }

  const startTime = toUnixSeconds(start);
  const endTime = toUnixSeconds(end);

  const query = {
    bucket_width: bucketWidth,
    limit: Math.min(
      Math.max(Number(limit) || 100, 1),
      1000
    ),
  };

  if (startTime !== null) {
    query.start_time = startTime;
  }

  if (endTime !== null) {
    query.end_time = endTime;
  }

  try {
    const response = await requestJson({
      method: "GET",
      path: "/v1/organization/costs",
      query,
    });

    const buckets = Array.isArray(
      response.data?.data
    )
      ? response.data.data
      : [];

    const observations = [];

    for (const bucket of buckets) {
      if (!bucket || typeof bucket !== "object") {
        continue;
      }

      const startDate = bucket.start_time
        ? new Date(bucket.start_time * 1000)
        : null;

      const endDate = bucket.end_time
        ? new Date(bucket.end_time * 1000)
        : null;

      const results = Array.isArray(
        bucket.results
      )
        ? bucket.results
        : [];

      for (const item of results) {
        if (!item || typeof item !== "object") {
          continue;
        }

        /*
         * OpenAI cost responses can contain amounts
         * in the provider's billing representation.
         * We only persist an amount when the provider
         * explicitly supplies one.
         */
        const amount =
          typeof item.amount?.value === "number"
            ? item.amount.value
            : typeof item.amount === "number"
              ? item.amount
              : null;

        if (
          typeof amount !== "number" ||
          !Number.isFinite(amount)
        ) {
          continue;
        }

        observations.push({
          provider: "openai",
          source: "openai_cost_api",
          status: "available",
          confidence: "provider_reported",
          value: amount,
          currency:
            item.amount?.currency ||
            item.currency ||
            null,
          observedAt: endDate || new Date(),
          retrievedAt: new Date(),
          period: {
            start: startDate,
            end: endDate,
          },
          projectId:
            item.project_id ||
            null,
          lineItemType:
            item.line_item_type ||
            null,
          organization:
            item.organization ||
            null,
        });
      }
    }

    return {
      provider: "openai",
      status: "available",
      available: true,
      source: "openai_cost_api",
      retrievedAt: new Date(),
      observations,
      rawMeta: {
        object:
          response.data?.object || null,
        hasMore:
          response.data?.has_more ?? null,
        nextPage:
          response.data?.next_page || null,
      },
    };
  } catch (error) {
    return {
      provider: "openai",
      status: normalizeStatus(error),
      available: false,
      observations: [],
      source: "openai_cost_api",
      retrievedAt: new Date(),
      error: {
        code:
          error.code ||
          "OPENAI_COST_REQUEST_FAILED",
        message:
          error.message ||
          "Unable to retrieve OpenAI cost",
        statusCode: error.statusCode || null,
      },
    };
  }
}

async function getProviderData(options = {}) {
  const [healthResult, usageResult, costResult] =
    await Promise.all([
      health(),
      getUsage(options),
      getCosts(options),
    ]);

  return {
    provider: "openai",
    retrievedAt: new Date(),
    health: healthResult,
    usage: usageResult,
    costs: costResult,
  };
}

module.exports = {
  provider: "openai",

  isConfigured,

  health,

  getUsage,

  getCosts,

  getProviderData,

  requestJson,
};
