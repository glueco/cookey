// ============================================
// SCHEMA-FIRST PIPELINE TESTS
// Validates the new enforcement invariants
// ============================================

import { describe, it } from "vitest";
import assert from "node:assert";

import {
  enforcePolicy,
  constraintsToPolicy,
  hasEnforceableConstraints,
} from "../enforce";
import type { EnforcementFields, EnforcementPolicy } from "@glueco/shared";
import { ErrorCode } from "@glueco/shared";

// ============================================
// TEST 1: Contract Enforcement
// Missing required model => ERR_POLICY_VIOLATION
// ============================================
describe("Contract Enforcement", () => {
  it("should reject when model is required but not provided", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["gpt-4", "gpt-3.5-turbo"],
    };

    // Enforcement fields without model (simulates malformed payload)
    const enforcement: EnforcementFields = {
      stream: false,
      usesTools: false,
      // model is missing!
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.violation?.code, ErrorCode.ERR_POLICY_VIOLATION);
    assert.strictEqual(result.violation?.field, "model");
  });

  it("should reject when streaming constraint exists but stream field not provided", () => {
    const policy: EnforcementPolicy = {
      allowStreaming: false,
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      // stream is missing!
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.violation?.code, ErrorCode.ERR_POLICY_VIOLATION);
    assert.strictEqual(result.violation?.field, "stream");
  });

  it("should reject when tools constraint exists but usesTools field not provided", () => {
    const policy: EnforcementPolicy = {
      allowTools: false,
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      stream: false,
      // usesTools is missing!
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.violation?.code, ErrorCode.ERR_POLICY_VIOLATION);
    assert.strictEqual(result.violation?.field, "usesTools");
  });
});

// ============================================
// TEST 2: Policy Enforcement
// allowedModels set and model not allowed => ERR_MODEL_NOT_ALLOWED
// ============================================
describe("Policy Enforcement", () => {
  it("should reject when model is not in allowed list", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["gpt-4", "gpt-3.5-turbo"],
    };

    const enforcement: EnforcementFields = {
      model: "claude-3-opus", // Not in allowed list
      stream: false,
      usesTools: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.violation?.code, ErrorCode.ERR_MODEL_NOT_ALLOWED);
    assert.strictEqual(result.violation?.field, "model");
    assert.strictEqual(result.violation?.actual, "claude-3-opus");
  });

  it("should reject when max tokens exceeded", () => {
    const policy: EnforcementPolicy = {
      maxOutputTokens: 1000,
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      maxOutputTokens: 5000, // Exceeds limit
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(
      result.violation?.code,
      ErrorCode.ERR_MAX_TOKENS_EXCEEDED,
    );
    assert.strictEqual(result.violation?.actual, 5000);
    assert.strictEqual(result.violation?.limit, 1000);
  });

  it("should reject when streaming is used but not allowed", () => {
    const policy: EnforcementPolicy = {
      allowStreaming: false,
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      stream: true, // Not allowed
      usesTools: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(
      result.violation?.code,
      ErrorCode.ERR_STREAMING_NOT_ALLOWED,
    );
  });

  it("should reject when tools are used but not allowed", () => {
    const policy: EnforcementPolicy = {
      allowTools: false,
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      stream: false,
      usesTools: true, // Not allowed
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.violation?.code, ErrorCode.ERR_TOOLS_NOT_ALLOWED);
  });

  it("should allow model with models/ prefix when allowedModels has bare name", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["gemini-1.5-flash"],
    };

    const enforcement: EnforcementFields = {
      model: "models/gemini-1.5-flash",
      stream: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
  });

  it("should allow bare model name when allowedModels has models/ prefix", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["models/gemini-1.5-flash"],
    };

    const enforcement: EnforcementFields = {
      model: "gemini-1.5-flash",
      stream: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
  });
});

// ============================================
// TEST 3: No Bypass
// Malformed payload that previously caused extraction {} => now rejected
// ============================================
describe("No Bypass - Fail Closed", () => {
  it("should not allow request when allowedModels constraint exists but model not extracted", () => {
    // This simulates the old behavior where extraction returned {} for malformed payload
    // In the old system, this would pass because model was undefined
    // In schema-first, this MUST fail

    const policy: EnforcementPolicy = {
      allowedModels: ["gpt-4", "gpt-3.5-turbo"],
    };

    // Empty enforcement (simulates failed extraction in old system)
    const enforcement: EnforcementFields = {};

    const result = enforcePolicy(policy, enforcement);

    // Must be rejected - no "fail open" behavior
    assert.strictEqual(result.allowed, false);
    assert.strictEqual(result.violation?.code, ErrorCode.ERR_POLICY_VIOLATION);
  });

  it("should not bypass streaming constraint with missing stream field", () => {
    const policy: EnforcementPolicy = {
      allowStreaming: false,
    };

    // stream field not provided
    const enforcement: EnforcementFields = {
      model: "gpt-4",
      usesTools: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
  });

  it("should not bypass tools constraint with missing usesTools field", () => {
    const policy: EnforcementPolicy = {
      allowTools: false,
    };

    // usesTools field not provided
    const enforcement: EnforcementFields = {
      model: "gpt-4",
      stream: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, false);
  });
});

// ============================================
// TEST 4: Regression - Valid requests pass
// ============================================
describe("Regression - Valid Requests", () => {
  it("should allow valid request with allowed model", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant"],
    };

    const enforcement: EnforcementFields = {
      model: "llama-3.3-70b-versatile",
      stream: false,
      usesTools: false,
      maxOutputTokens: 1000,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
    assert.strictEqual(result.violation, undefined);
  });

  it("should allow valid request with streaming when allowed", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["gemini-1.5-flash"],
      // allowStreaming not set = allowed by default
    };

    const enforcement: EnforcementFields = {
      model: "gemini-1.5-flash",
      stream: true,
      usesTools: false,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
  });

  it("should allow valid request with tools when allowed", () => {
    const policy: EnforcementPolicy = {
      allowedModels: ["gpt-4"],
      // allowTools not set = allowed by default
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      stream: false,
      usesTools: true,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
  });

  it("should allow request when max tokens within limit", () => {
    const policy: EnforcementPolicy = {
      maxOutputTokens: 4096,
    };

    const enforcement: EnforcementFields = {
      model: "gpt-4",
      maxOutputTokens: 2048,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
  });

  it("should allow request with no constraints", () => {
    const policy: EnforcementPolicy = {};

    const enforcement: EnforcementFields = {
      model: "any-model",
      stream: true,
      usesTools: true,
      maxOutputTokens: 10000,
    };

    const result = enforcePolicy(policy, enforcement);

    assert.strictEqual(result.allowed, true);
  });
});

// ============================================
// TEST 5: Helper functions
// ============================================
describe("Helper Functions", () => {
  it("hasEnforceableConstraints should return true for allowedModels", () => {
    const constraints = { allowedModels: ["gpt-4"] };
    assert.strictEqual(hasEnforceableConstraints(constraints), true);
  });

  it("hasEnforceableConstraints should return true for maxOutputTokens", () => {
    const constraints = { maxOutputTokens: 1000 };
    assert.strictEqual(hasEnforceableConstraints(constraints), true);
  });

  it("hasEnforceableConstraints should return true for allowTools=false", () => {
    const constraints = { allowTools: false };
    assert.strictEqual(hasEnforceableConstraints(constraints), true);
  });

  it("hasEnforceableConstraints should return false for allowTools=true", () => {
    const constraints = { allowTools: true };
    assert.strictEqual(hasEnforceableConstraints(constraints), false);
  });

  it("hasEnforceableConstraints should return false for empty constraints", () => {
    const constraints = {};
    assert.strictEqual(hasEnforceableConstraints(constraints), false);
  });

  it("hasEnforceableConstraints should return false for null", () => {
    assert.strictEqual(hasEnforceableConstraints(null), false);
  });

  it("constraintsToPolicy should extract relevant fields", () => {
    const constraints = {
      allowedModels: ["gpt-4"],
      maxOutputTokens: 1000,
      allowStreaming: false,
      allowTools: false,
      irrelevantField: "should be ignored",
    };

    const policy = constraintsToPolicy(constraints);

    assert.deepStrictEqual(policy.allowedModels, ["gpt-4"]);
    assert.strictEqual(policy.maxOutputTokens, 1000);
    assert.strictEqual(policy.allowStreaming, false);
    assert.strictEqual(policy.allowTools, false);
    assert.strictEqual(
      (policy as Record<string, unknown>).irrelevantField,
      undefined,
    );
  });
});
