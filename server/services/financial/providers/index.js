"use strict";

/*
 * Financial provider adapters
 *
 * This file only wires the provider adapters together.
 * It does NOT create fake data, credentials, payment
 * transactions, or infrastructure.
 */

const openaiProviderAdapter = require("./openaiProviderAdapter");
const awsProviderAdapter = require("./awsProviderAdapter");
const stripeProviderAdapter = require("./stripeProviderAdapter");
const razorpayProviderAdapter = require("./razorpayProviderAdapter");
const whatsappProviderAdapter = require("./whatsappProviderAdapter");

const providers = Object.freeze({
  openai: openaiProviderAdapter,
  aws: awsProviderAdapter,
  stripe: stripeProviderAdapter,
  razorpay: razorpayProviderAdapter,
  whatsapp: whatsappProviderAdapter,
});

function getProvider(name) {
  const providerName = String(
    name || ""
  )
    .trim()
    .toLowerCase();

  return (
    providers[providerName] ||
    null
  );
}

function hasProvider(name) {
  return Boolean(
    getProvider(name)
  );
}

function listProviders() {
  return Object.keys(providers);
}

function getConfiguredProviders() {
  return listProviders().filter(
    (name) => {
      const provider =
        providers[name];

      return (
        typeof provider.isConfigured ===
          "function" &&
        provider.isConfigured()
      );
    }
  );
}

async function getProviderHealth(name) {
  const provider =
    getProvider(name);

  if (!provider) {
    return {
      provider: String(
        name || ""
      ).toLowerCase(),
      status: "unknown",
      available: false,
      error: {
        code:
          "FINANCIAL_PROVIDER_NOT_FOUND",
        message:
          "Financial provider adapter not found",
      },
    };
  }

  if (
    typeof provider.health !==
    "function"
  ) {
    return {
      provider: name,
      status: "unavailable",
      available: false,
      error: {
        code:
          "FINANCIAL_PROVIDER_HEALTH_UNAVAILABLE",
        message:
          "Provider health method is unavailable",
      },
    };
  }

  try {
    return await provider.health();
  } catch (error) {
    return {
      provider: name,
      status: "error",
      available: false,
      error: {
        code:
          error?.code ||
          "FINANCIAL_PROVIDER_HEALTH_FAILED",
        message:
          error?.message ||
          "Provider health check failed",
      },
    };
  }
}

async function getAllProviderHealth() {
  const names =
    listProviders();

  const results =
    await Promise.all(
      names.map(async (name) => {
        const result =
          await getProviderHealth(
            name
          );

        return {
          name,
          ...result,
        };
      })
    );

  return results;
}

async function getProviderData(
  name,
  options = {}
) {
  const provider =
    getProvider(name);

  if (!provider) {
    return {
      provider: String(
        name || ""
      ).toLowerCase(),
      status: "unknown",
      available: false,
      error: {
        code:
          "FINANCIAL_PROVIDER_NOT_FOUND",
        message:
          "Financial provider adapter not found",
      },
    };
  }

  if (
    typeof provider.getProviderData !==
    "function"
  ) {
    return {
      provider: name,
      status: "unavailable",
      available: false,
      error: {
        code:
          "FINANCIAL_PROVIDER_DATA_UNAVAILABLE",
        message:
          "Provider data method is unavailable",
      },
    };
  }

  try {
    return await provider.getProviderData(
      options
    );
  } catch (error) {
    return {
      provider: name,
      status: "error",
      available: false,
      retrievedAt: new Date(),
      error: {
        code:
          error?.code ||
          "FINANCIAL_PROVIDER_DATA_FAILED",
        message:
          error?.message ||
          "Provider data request failed",
      },
    };
  }
}

async function getAllProviderData(
  options = {}
) {
  const names =
    listProviders();

  const results =
    await Promise.all(
      names.map(async (name) => {
        const data =
          await getProviderData(
            name,
            options
          );

        return {
          name,
          ...data,
        };
      })
    );

  return results;
}

module.exports = {
  providers,

  openai:
    openaiProviderAdapter,

  aws:
    awsProviderAdapter,

  stripe:
    stripeProviderAdapter,

  razorpay:
    razorpayProviderAdapter,

  whatsapp:
    whatsappProviderAdapter,

  getProvider,

  hasProvider,

  listProviders,

  getConfiguredProviders,

  getProviderHealth,

  getAllProviderHealth,

  getProviderData,

  getAllProviderData,
};
