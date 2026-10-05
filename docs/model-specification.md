# Model & Canonical Evaluation Specification

## 1. TypeSafe System One Canonical Model Alignment

The TypeSafe extension integrates directly with the **TypeSafe System One** evaluation layer. Per official specifications and architectural alignment ADRs, the canonical model tier is:

$$\mathbf{Model} = \text{"jev-latest"}$$

### 1.1 Canonical vs Legacy Tiers
- **`jev-latest`**: The standard canonical model tier supporting structured noul evaluations, probability distributions, semantic choices, and high-fidelity triage.
- **Legacy / Non-existent Tiers**: Tiers like `jev-fast` are deprecated or non-canonical; the extension automatically normalizes requests to `jev-latest`.

---

## 2. Dynamic Environment Overrides

To facilitate custom evaluation tiers, local proxies, or experimental models without modifying protected code, the extension supports environment variable overrides:

| Environment Variable | Target Subsystem | Default Value | Description |
|----------------------|------------------|---------------|-------------|
| `TYPESAFE_DEFAULT_MODEL` | General Judge / Verification Gates | `jev-latest` | Overrides the primary System One judge model |
| `TYPESAFE_PREDICT_MODEL` | Multi-Persona Debate Evaluator | `jev-latest` | Overrides the model used during `ck:predict` debates |
| `TYPESAFE_BASELINE` | Policy Client Baseline Level | `review` | Default safety baseline (`auto`, `review`, `block`) |
| `TYPESAFE_LATTICE` | Policy Lattice Options | `auto,review,block` | Permitted lattice escalation boundaries |

---

## 3. Question Types & Scoring Schemata

TypeSafe System One evaluates questions according to 3 structured schema types:

### 3.1 Noul Questions (Probability / Confidence: $0.0 \dots 1.0$)
Calculates the calibrated likelihood that a condition is satisfied.
- **`meets_criteria`**: Calibrated probability that the implementation satisfies stated acceptance criteria.
  $$\text{Pass Threshold} \ge 0.70$$
- **`claude_account_untouched`**: Strict isolation probability.
  $$\text{Pass Requirement} = 1.00$$

### 3.2 Choice Questions (Categorical Classification)
Classifies input into discrete enumerated categories:
- **Scope Mode (`scope_arbiter`)**:
  - `HOLD`: Scope is preserved accurately.
  - `EXPANSION`: Additional deliverables or unrequested features added.
  - `REDUCTION`: Deliverables or constraints dropped without permission (**Rejection Trigger**).
- **Architectural Drift (`drift_guard`)**:
  - `no_drift`: Implementation aligns with task objectives.
  - `unapproved_deviation`: Changes diverge from technical plan.
  - `scope_creep`: Unrelated files modified.

### 3.3 Score Questions (Ordinal Rating: $0 \dots 3$)
Discrete ordinal evaluation:
- **`0`**: Severe vulnerability / Critical flaw / Complete failure.
- **`1`**: Marginal / Sub-standard quality / Requires rework.
- **`2`**: Good / Acceptable standards met.
- **`3`**: Exemplary / Clean, robust, and hardened implementation.
