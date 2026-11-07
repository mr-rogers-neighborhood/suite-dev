import { describe, expect, it } from "vitest";
import {
  artifactNameFromFeed,
  pkgbuildFor,
  tagProblem,
  versionDisagreement,
  versionFromPackage,
} from "./release.mjs";

const realFeed = [
  "version: 0.1.0",
  "files:",
  "  - url: suite-canvas-0.1.0-x86_64.AppImage",
  "    sha512: dmuphTeY3G3RNc7+S0bRU3Me//dFxNoBSKMsdOGlNIBxe/tz0f1IoBv3mYOAP//cZ3qEVWCO0PNK0aLSl+J5bQ==",
  "    size: 153291139",
  "    blockMapSize: 162199",
  "path: suite-canvas-0.1.0-x86_64.AppImage",
  "sha512: dmuphTeY3G3RNc7+S0bRU3Me//dFxNoBSKMsdOGlNIBxe/tz0f1IoBv3mYOAP//cZ3qEVWCO0PNK0aLSl+J5bQ==",
  "releaseDate: '2026-11-06T19:29:45.218Z'",
  "",
].join("\n");

describe("versionFromPackage", () => {
  it("reads the version the release will be", () => {
    expect(versionFromPackage('{"name":"@suite/planner","version":"0.2.0"}')).toBe("0.2.0");
  });

  it("is null when there is no version to read", () => {
    expect(versionFromPackage('{"name":"@suite/planner"}')).toBeNull();
    expect(versionFromPackage("not json")).toBeNull();
  });
});

describe("versionDisagreement", () => {
  it("says nothing when the version, the manifest and the tag will agree", () => {
    expect(versionDisagreement({ packageVersion: "0.1.0", manifestVersion: "0.1.0" })).toBeNull();
  });

  it("excuses the hub, which ships no manifest", () => {
    expect(versionDisagreement({ packageVersion: "0.3.0", manifestVersion: undefined })).toBeNull();
  });

  it("refuses a release whose manifest describes a different version", () => {
    const why = versionDisagreement({ packageVersion: "0.2.0", manifestVersion: "0.1.0" });
    expect(why).toContain("0.2.0");
    expect(why).toContain("0.1.0");
    expect(why).toContain("one commit");
  });

  it("refuses a package with no version at all", () => {
    expect(versionDisagreement({ packageVersion: null, manifestVersion: undefined })).toBe(
      "package.json names no version",
    );
  });

  it("refuses a manifest with no version rather than assuming", () => {
    expect(versionDisagreement({ packageVersion: "0.1.0", manifestVersion: null })).toBe(
      "suite.app.json names no version",
    );
  });
});

describe("artifactNameFromFeed", () => {
  it("names the file electron-builder wrote", () => {
    expect(artifactNameFromFeed(realFeed)).toBe("suite-canvas-0.1.0-x86_64.AppImage");
  });

  it("is null when the feed names no path", () => {
    expect(artifactNameFromFeed("version: 0.1.0\n")).toBeNull();
  });
});

describe("tagProblem", () => {
  it("explains a tag that is already taken, and names the fix", () => {
    // suite-start's tags are the shared-package line the apps pin; its app is 0.3.0,
    // so `v0.3.0` is taken by something else entirely.
    const why = tagProblem({ tag: "v0.3.0", version: "0.3.0" });
    expect(why).toContain("already exists");
    expect(why).toContain("one commit");
    expect(why).toContain("--tag start-v0.3.0");
  });

  it("is a sentence for any taken tag, not only the default name", () => {
    expect(tagProblem({ tag: "start-v0.3.0", version: "0.3.0" })).toContain("start-v0.3.0");
  });
});

describe("pkgbuildFor", () => {
  const pkgbuild = [
    "pkgname=suite-start-bin",
    "pkgver=0.3.0",
    "pkgrel=1",
    "sha256sums=('577c510da3cd3ff532e92b46ee6ca0b2e17f80f0c64102bc2276562ca3529b1d')",
    "",
  ].join("\n");

  it("rewrites the version and the checksum to the artifact this run produced", () => {
    // A committed PKGBUILD records the release it was written for; a release builds a
    // package from its own bytes, so both numbers come from the run, not the file.
    const patched = pkgbuildFor({ text: pkgbuild, version: "0.4.0", sha256: "abc123" });
    expect(patched).toContain("pkgver=0.4.0");
    expect(patched).toContain("sha256sums=('abc123')");
    expect(patched).not.toContain("0.3.0");
  });

  it("resets pkgrel, so a rebuilt version is not silently numbered as a revision", () => {
    const patched = pkgbuildFor({
      text: pkgbuild.replace("pkgrel=1", "pkgrel=7"),
      version: "0.4.0",
      sha256: "abc123",
    });
    expect(patched).toContain("pkgrel=1");
  });

  it("refuses a file it cannot rewrite rather than building a wrong package", () => {
    expect(() => pkgbuildFor({ text: "pkgname=x\n", version: "1.0.0", sha256: "a" })).toThrow(
      /pkgver or sha256sums/u,
    );
  });
});
