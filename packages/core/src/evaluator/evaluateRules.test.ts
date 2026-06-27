import { describe, expect, it } from "vitest";

import type { RubricConfig } from "../config/configSchema.js";
import { defaultRubricConfig } from "../config/defaults.js";
import {
  evaluateRules,
  RubricError,
  type ChangedFile,
  type ChangeSet,
  type RubricRule
} from "../index.js";

describe("evaluateRules", () => {
  it("applies an API rule when an API file changed", async () => {
    const findings = await evaluateRules({
      rules: [apiRule()],
      changeSet: changeSet([changedFile("src/api/users.ts")]),
      config: defaultConfig()
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "testing.required-for-api-change:required_changed_files:any",
      ruleId: "testing.required-for-api-change"
    });
  });

  it("triggers required_changed_files.any when an API change has no test file", async () => {
    const findings = await evaluateRules({
      rules: [apiRule()],
      changeSet: changeSet([changedFile("src/api/users.ts")]),
      config: defaultConfig()
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "testing.required-for-api-change:required_changed_files:any",
        files: [],
        evidence: [
          {
            kind: "missing_changed_file",
            text: "tests/**/*.test.ts"
          }
        ]
      })
    ]);
  });

  it("does not trigger required_changed_files.any when an API change has a test file", async () => {
    const findings = await evaluateRules({
      rules: [apiRule()],
      changeSet: changeSet([
        changedFile("src/api/users.ts"),
        changedFile("tests/users.test.ts")
      ]),
      config: defaultConfig()
    });

    expect(findings).toEqual([]);
  });

  it("reports missing patterns for required_changed_files.all", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          checks: {
            required_changed_files: {
              all: ["tests/**/*.test.ts", "docs/**/*.md"]
            }
          }
        })
      ],
      changeSet: changeSet([
        changedFile("src/api/users.ts"),
        changedFile("tests/users.test.ts")
      ]),
      config: defaultConfig()
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "rule.required-tests:required_changed_files:all",
        evidence: [
          {
            kind: "missing_changed_file",
            text: "docs/**/*.md"
          }
        ]
      })
    ]);
  });

  it("catches forbidden changed files", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          checks: {
            forbidden_changed_files: {
              any: ["secrets/**"]
            }
          }
        })
      ],
      changeSet: changeSet([
        changedFile("src/api/users.ts"),
        changedFile("secrets/prod.env")
      ]),
      config: defaultConfig()
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "rule.required-tests:forbidden_changed_files:any",
        files: ["secrets/prod.env"],
        evidence: [
          {
            kind: "forbidden_changed_file",
            path: "secrets/prod.env"
          }
        ]
      })
    ]);
  });

  it("catches a missing rollback section for migration rules", async () => {
    const findings = await evaluateRules({
      rules: [migrationRule()],
      changeSet: changeSet([changedFile("db/migrations/001_add_users.sql")]),
      config: defaultConfig(),
      pr: {
        body: "## Summary\n\nAdds users table.\n"
      }
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "db.migration-rollback-note:required_pr_body_sections:any",
        evidence: [
          {
            kind: "missing_pr_body_section",
            text: "Rollback plan"
          }
        ]
      })
    ]);
  });

  it("accepts a rollback section as a Markdown heading", async () => {
    const findings = await evaluateRules({
      rules: [migrationRule()],
      changeSet: changeSet([changedFile("db/migrations/001_add_users.sql")]),
      config: defaultConfig(),
      pr: {
        body: "## Summary\n\nAdds users table.\n\n## Rollback plan\n\nDrop it.\n"
      }
    });

    expect(findings).toEqual([]);
  });

  it("triggers changed_directories_greater_than", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          checks: {
            changed_directories_greater_than: 2
          }
        })
      ],
      changeSet: changeSet(
        [
          changedFile("src/api/users.ts"),
          changedFile("tests/users.test.ts"),
          changedFile("docs/users.md")
        ],
        {
          directoriesChanged: 3
        }
      ),
      config: defaultConfig()
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "rule.required-tests:changed_directories_greater_than",
        evidence: [
          {
            kind: "changed_directories",
            text: "3 > 2"
          }
        ]
      })
    ]);
  });

  it("matches added_patterns against added patch lines", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          checks: {
            added_patterns: ["console\\.log"]
          }
        })
      ],
      changeSet: changeSet([changedFile("src/api/users.ts")], {
        patch: patchFor("src/api/users.ts", ["console.log('debug');"])
      }),
      config: defaultConfig()
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "rule.required-tests:added_patterns",
        files: ["src/api/users.ts"],
        evidence: [
          {
            kind: "added_pattern",
            path: "src/api/users.ts",
            text: "console\\.log"
          }
        ]
      })
    ]);
  });

  it("does not match added_patterns against removed patch lines", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          checks: {
            added_patterns: ["sk-old-secret"]
          }
        })
      ],
      changeSet: changeSet([changedFile("src/api/users.ts")], {
        patch: patchFor(
          "src/api/users.ts",
          ["const token = process.env.API_KEY;"],
          ["const token = 'sk-old-secret';"]
        )
      }),
      config: defaultConfig()
    });

    expect(findings).toEqual([]);
  });

  it("does not match added_patterns against diff headers", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          checks: {
            added_patterns: ["src/api/users\\.ts"]
          }
        })
      ],
      changeSet: changeSet([changedFile("src/api/users.ts")], {
        patch: patchFor("src/api/users.ts", ["export const user = 'new';"])
      }),
      config: defaultConfig()
    });

    expect(findings).toEqual([]);
  });

  it("matches added_patterns only in files matching applies_to.paths", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          applies_to: {
            paths: ["db/migrations/**"]
          },
          checks: {
            added_patterns: ["DROP\\s+TABLE"]
          }
        })
      ],
      changeSet: changeSet(
        [
          changedFile("db/migrations/001_add_users.sql"),
          changedFile("src/fixtures/destructive.sql")
        ],
        {
          patch: [
            patchFor("db/migrations/001_add_users.sql", [
              "CREATE TABLE users (id integer primary key);"
            ]),
            patchFor("src/fixtures/destructive.sql", ["DROP TABLE users;"])
          ].join("\n")
        }
      ),
      config: defaultConfig()
    });

    expect(findings).toEqual([]);
  });

  it("reports only files where added_patterns matched", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          applies_to: {
            paths: ["db/migrations/**"]
          },
          checks: {
            added_patterns: ["DROP\\s+TABLE"]
          }
        })
      ],
      changeSet: changeSet(
        [
          changedFile("db/migrations/001_add_users.sql"),
          changedFile("db/migrations/002_drop_users.sql")
        ],
        {
          patch: [
            patchFor("db/migrations/001_add_users.sql", [
              "CREATE TABLE users (id integer primary key);"
            ]),
            patchFor("db/migrations/002_drop_users.sql", ["DROP TABLE users;"])
          ].join("\n")
        }
      ),
      config: defaultConfig()
    });

    expect(findings).toEqual([
      expect.objectContaining({
        id: "rule.required-tests:added_patterns",
        files: ["db/migrations/002_drop_users.sql"],
        evidence: [
          {
            kind: "added_pattern",
            path: "db/migrations/002_drop_users.sql",
            text: "DROP\\s+TABLE"
          }
        ]
      })
    ]);
  });

  it("throws RubricError for invalid added_patterns regex", async () => {
    await expect(
      evaluateRules({
        rules: [
          rule({
            checks: {
              added_patterns: ["["]
            }
          })
        ],
        changeSet: changeSet([changedFile("src/api/users.ts")]),
        config: defaultConfig()
      })
    ).rejects.toThrow(RubricError);
    await expect(
      evaluateRules({
        rules: [
          rule({
            checks: {
              added_patterns: ["["]
            }
          })
        ],
        changeSet: changeSet([changedFile("src/api/users.ts")]),
        config: defaultConfig()
      })
    ).rejects.toThrow("rule.required-tests");
  });

  it("does not evaluate rules when applies_to.paths does not match", async () => {
    const findings = await evaluateRules({
      rules: [apiRule()],
      changeSet: changeSet([changedFile("docs/usage.md")]),
      config: defaultConfig()
    });

    expect(findings).toEqual([]);
  });

  it("sets blocking to true for error findings when fail_on includes error", async () => {
    const findings = await evaluateRules({
      rules: [
        apiRule({
          severity: "error"
        })
      ],
      changeSet: changeSet([changedFile("src/api/users.ts")]),
      config: defaultConfig()
    });

    expect(findings[0]?.blocking).toBe(true);
  });

  it("sets blocking to false for warning findings by default", async () => {
    const findings = await evaluateRules({
      rules: [apiRule()],
      changeSet: changeSet([changedFile("src/api/users.ts")]),
      config: defaultConfig()
    });

    expect(findings[0]?.blocking).toBe(false);
  });

  it("sorts findings deterministically by severity, rule id, and finding id", async () => {
    const findings = await evaluateRules({
      rules: [
        rule({
          id: "z.warning-rule",
          severity: "warning",
          checks: {
            required_changed_files: {
              any: ["tests/**/*.test.ts"]
            }
          }
        }),
        rule({
          id: "b.error-rule",
          severity: "error",
          checks: {
            forbidden_changed_files: {
              any: ["src/api/**"]
            }
          }
        }),
        rule({
          id: "a.error-rule",
          severity: "error",
          checks: {
            required_changed_files: {
              any: ["docs/**/*.md"]
            }
          }
        })
      ],
      changeSet: changeSet([changedFile("src/api/users.ts")]),
      config: defaultConfig()
    });

    expect(findings.map((finding) => finding.id)).toEqual([
      "a.error-rule:required_changed_files:any",
      "b.error-rule:forbidden_changed_files:any",
      "z.warning-rule:required_changed_files:any"
    ]);
  });
});

function apiRule(overrides: Partial<RubricRule> = {}): RubricRule {
  return rule({
    id: "testing.required-for-api-change",
    title: "Tests required for API changes",
    applies_to: {
      paths: ["src/api/**"]
    },
    checks: {
      required_changed_files: {
        any: ["tests/**/*.test.ts"]
      }
    },
    ...overrides
  });
}

function migrationRule(overrides: Partial<RubricRule> = {}): RubricRule {
  return rule({
    id: "db.migration-rollback-note",
    title: "Migration rollback plan required",
    applies_to: {
      paths: ["db/migrations/**"]
    },
    checks: {
      required_pr_body_sections: {
        any: ["Rollback plan"]
      }
    },
    ...overrides
  });
}

function rule(overrides: Partial<RubricRule> = {}): RubricRule {
  return {
    id: "rule.required-tests",
    title: "Tests required",
    severity: "warning",
    applies_to: {
      paths: ["**/*"]
    },
    checks: {},
    message: "Required evidence is missing.",
    suggestion: "Add the missing evidence.",
    compile: {
      targets: ["agents"]
    },
    evidence: {
      source: "manual",
      confidence: 0.5
    },
    ...overrides
  };
}

function defaultConfig(): RubricConfig {
  return {
    ...defaultRubricConfig,
    modes: {
      check: {
        fail_on: ["error"],
        warn_on: ["warning", "info"]
      }
    }
  };
}

function changeSet(
  files: ChangedFile[],
  overrides: Partial<ChangeSet> & {
    directoriesChanged?: number;
  } = {}
): ChangeSet {
  const directoriesChanged =
    overrides.directoriesChanged ??
    new Set(files.map((file) => file.directory)).size;

  return {
    baseRef: "master",
    headRef: "HEAD",
    mergeBase: "abc123",
    files,
    stats: {
      filesChanged: files.length,
      additions: files.reduce((total, file) => total + file.additions, 0),
      deletions: files.reduce((total, file) => total + file.deletions, 0),
      directoriesChanged
    },
    patch: "",
    ...overrides
  };
}

function changedFile(
  path: string,
  overrides: Partial<ChangedFile> = {}
): ChangedFile {
  const slashIndex = path.lastIndexOf("/");
  const dotIndex = path.lastIndexOf(".");
  const directory = slashIndex === -1 ? "." : path.slice(0, slashIndex);

  return {
    path,
    status: "modified",
    additions: 1,
    deletions: 0,
    extension: dotIndex === -1 ? "" : path.slice(dotIndex),
    directory,
    isTest: path.includes(".test.") || path.includes(".spec."),
    isGenerated: false,
    isBinary: false,
    ...overrides
  };
}

function patchFor(
  path: string,
  addedLines: string[],
  removedLines: string[] = []
): string {
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    "@@ -1 +1 @@",
    ...removedLines.map((line) => `-${line}`),
    ...addedLines.map((line) => `+${line}`)
  ].join("\n");
}
