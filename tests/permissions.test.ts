import { CheckPermissionsResponse, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { checkPermissions, getParentPath, getPathDomain, sanitizePath } from "../scripts/permissions";

describe("default checkPermissions", () => {
  const perm1 = new Permission("app.hns/", "app.hns", PermCategory.Discoverable, PermType.Read);
  const perm2 = new Permission("app.hns", "app.hns/path", PermCategory.Discoverable, PermType.Read);
  const perm3 = new Permission("app.hns", "dac.hns", PermCategory.Discoverable, PermType.Read);
  const perms = [perm1, perm2, perm3];

  it("for dev, should grant all permissions", async () => {
    const resp: CheckPermissionsResponse = await checkPermissions(perms, true);

    expect(resp.grantedPermissions).toEqual([perm1, perm2, perm3]);
    expect(resp.failedPermissions).toEqual([]);
  });
});

describe("getPathDomain", () => {
  const paths = [
    ["path.hns/path", "path.hns"],
    ["path.hns//path/path/", "path.hns"],
  ];

  it.each(paths)("domain for path %s should be %s", (path, pathDomain) => {
    const receivedDomain = getPathDomain(path);
    expect(receivedDomain).toEqual(pathDomain);
  });
});

describe("parentPath", () => {
  const paths = [
    ["app.hns/path/file.json", "app.hns/path"],
    ["app.hns///path///file.json", "app.hns/path"],
    ["app.hns//path", "app.hns"],
    ["app.hns/path/", "app.hns"],
    ["app.hns//", null],
  ];

  it.each(paths)("parent path for %s should be %s", (path, parentPath) => {
    const receivedPath = getParentPath(path);
    expect(receivedPath).toEqual(parentPath);
  });
});

describe("sanitizePath", () => {
  const paths = [
    ["test.hns", "test.hns"],
    ["path.hns", "path.hns"],
  ];

  it.each(paths)("path %s should be sanitized to %s", (path, sanitizedPath) => {
    const receivedPath = sanitizePath(path);
    expect(receivedPath).toEqual(sanitizedPath);
  });
});
