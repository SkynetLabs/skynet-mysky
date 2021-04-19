import { CheckPermissionsResponse, PermCategory, Permission, PermType } from "skynet-mysky-utils";
import { checkPermissions } from "../scripts/permissions";

describe("default checkPermissions", () => {
  const perm1 = new Permission("app.hns/", "app.hns", PermCategory.Discoverable, PermType.Read);
  const perm2 = new Permission("app.hns", "app.hns/path", PermCategory.Discoverable, PermType.Read);
  const perm3 = new Permission("app.hns", "dac.hns", PermCategory.Discoverable, PermType.Read);
  const perms = [
    perm1,
    perm2,
    perm3,
  ];

  it("for non-dev, should return the correct lists of granted and failed permissions", async () => {

    const resp: CheckPermissionsResponse = await checkPermissions(perms);

    expect(resp.grantedPermissions).toEqual([perm1, perm2]);
    expect(resp.failedPermissions).toEqual([perm3]);
  });

  it("for dev, should grant all permissions", async () => {

    const resp: CheckPermissionsResponse = await checkPermissions(perms, true);

    expect(resp.grantedPermissions).toEqual([perm1, perm2, perm3]);
    expect(resp.failedPermissions).toEqual([]);
  });
});
