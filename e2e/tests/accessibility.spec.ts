import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { launchStaged } from "../fixtures/suite";

/**
 * The automated half of the accessibility gate.
 *
 * axe finds roughly a third of real accessibility problems, so a green run here is a floor and
 * never a claim of conformance. It is still worth having: the class of bug it does catch
 * (unlabelled controls, missing landmarks, headings out of order, and text whose contrast fails
 * against what it is actually painted on) is exactly the class that is invisible in a screenshot
 * and tedious to check by hand across four apps and three themes.
 *
 * The manual half lives in `docs/accessibility/manual-testing.md`. A criterion is only "done"
 * when both halves agree.
 */
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * Run axe inside the page that is already open.
 *
 * `@axe-core/playwright` cannot be used here: it runs axe in a fresh page inside the browser
 * context, and Electron's protocol does not implement `Target.createTarget`. Evaluating the
 * axe bundle in the existing page also sidesteps the apps' content policy, which would refuse
 * an injected `<script>` tag.
 */
async function audit(
  page: Page,
): Promise<
  readonly { id: string; impact: string | null; help: string; nodes: readonly string[] }[]
> {
  if (!(await page.evaluate(() => "__suiteAxeLoaded" in window))) {
    const source = await readFile(
      createRequire(import.meta.url).resolve("axe-core/axe.min.js"),
      "utf8",
    );
    await page.evaluate(source);
    await page.evaluate(() => {
      Object.defineProperty(window, "__suiteAxeLoaded", { value: true, configurable: true });
    });
  }

  const results = await page.evaluate(
    async (tags) =>
      // biome-ignore lint/suspicious/noExplicitAny: axe attaches itself to the page global
      (window as any).axe.run(document, {
        runOnly: { type: "tag", values: tags },
        resultTypes: ["violations"],
      }),
    TAGS,
  );

  return (results.violations ?? []).map(
    (violation: {
      id: string;
      impact: string | null;
      help: string;
      nodes: { target: string[] }[];
    }) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      nodes: violation.nodes.map((node) => node.target.join(" ")),
    }),
  );
}

interface Screen {
  readonly id: string;
  readonly env: (root: string) => Record<string, string>;
  /** The first screen a person meets, which is what this checks. */
  readonly ready: (page: import("@playwright/test").Page) => Promise<void>;
}

const SCREENS: readonly Screen[] = [
  {
    id: "start",
    env: (root) => ({
      SUITE_START_USER_DATA: join(root, "user-data"),
      SUITE_START_DATA: join(root, "data"),
      SUITE_START_DOCUMENTS: join(root, "documents"),
      SUITE_START_APPS_ROOT: join(root, "apps"),
    }),
    ready: async (page) => {
      await page.locator("h1").first().waitFor({ timeout: 30_000 });
    },
  },
  {
    id: "canvas",
    env: (root) => ({
      SUITE_CANVAS_USER_DATA: join(root, "user-data"),
      SUITE_CANVAS_LIBRARY: join(root, "documents"),
    }),
    ready: async (page) => {
      await page.locator('[data-testid="workspace-launcher"]').waitFor({ timeout: 30_000 });
      // The alpha notice is a modal over the launcher; measuring the launcher through it would
      // report the modal's own contrast against a backdrop nobody reads.
      const dismiss = page.getByTestId("alpha-notice-dismiss");
      if (await dismiss.count()) await dismiss.click();
      await page.waitForTimeout(300);
    },
  },
  {
    id: "planner",
    env: (root) => ({
      SUITE_PLANNER_USER_DATA: join(root, "user-data"),
      SUITE_PLANNER_LIBRARY: join(root, "documents"),
    }),
    ready: async (page) => {
      await page.getByRole("heading", { name: "Suite Planner" }).waitFor({ timeout: 30_000 });
    },
  },
  {
    id: "budget",
    env: (root) => ({
      SUITE_BUDGET_USER_DATA: join(root, "user-data"),
      SUITE_BUDGET_LIBRARY: join(root, "documents"),
    }),
    ready: async (page) => {
      await page.getByRole("heading", { name: "Suite Budget" }).waitFor({ timeout: 30_000 });
    },
  },
];

for (const screen of SCREENS) {
  test(`${screen.id} start screen has no axe violations`, async () => {
    const root = await mkdtemp(join(tmpdir(), `suite-a11y-${screen.id}-`));
    const launched = await launchStaged(screen.id, { root, env: screen.env(root) });
    try {
      await screen.ready(launched.page);

      // Printed in full so a failure says which rule, which element, and why.
      expect(await audit(launched.page)).toEqual([]);
    } finally {
      await launched.close();
      await rm(root, { recursive: true, force: true });
    }
  });
}
