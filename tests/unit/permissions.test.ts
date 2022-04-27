import { createPermissionKey } from "../../src/permissions";

describe("createPermissionsKey", () => {
  const perms = [
    ["app.hns/", "skapp.hns//path/file/", "[app.hns],[skapp.hns/path/file]"],
    ["APP.Hns//", "SKAPP.hns/", "[app.hns],[skapp.hns]"],
  ];

  it.each(perms)("storage key for requestor '%s' and path '%s' should be '%s'", (requestor, path, key) => {
    const receivedKey = createPermissionKey(requestor, path);
    expect(receivedKey).toEqual(key);
  });
});
