# skynet-mysky

This is the repo that contains the MySky invisible element, MySky UI, the default permissions provider, and the default seed provider.

MySky domain: `skynet-mysky.hns`

## Dev

The Dev domain is: `sandbridge.hns` (to be changed).

All permissions are allowed, making testing easier. This can be enabled with `client.loadMySky(<hostApp>, { dev: true })`.

## Debug

You can also enable debug messages with `client.loadMySky(<hostApp>, { debug: true })`. Both `dev` and `debug` can be set.

## Deployment

```
npm run build
```

Upload `dist/` folder to Skynet.

You can check the `version.txt` file on the live site to see the latest git commit it was built with, e.g. `skynet-mysky.hns.siasky.net/version.txt`.

### Dev Build

```
npm run build-dev
```

### Dev Note

We are currently using [the SkyDeploy skapp](https://sky-deploy.hns.siasky.net/#/deploy) for prod (skynet-mysky.hns) and dev (skynet-mysky-dev.hns). We are using [redsolver's skydeploy utility](https://github.com/redsolver/skydeploy/) for alpha (sandbridge.hns).

## Changelog

[Changelog](./CHANGELOG.md)
