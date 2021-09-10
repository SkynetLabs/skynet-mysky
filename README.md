# skynet-mysky

This is the repo that contains the MySky invisible element, MySky UI, the default permissions provider, and the default seed provider.

MySky domain: `skynet-mysky.hns`

## Docs

For API docs please refer to the [SDK docs](https://siasky.net/docs/#mysky).

For an interactive workshop, look [here](https://app.gitbook.com/@skynet-labs/s/skynet-developer-guide/skynet-workshops/introduction-workshop).

## Dev

The Dev domain is: `sandbridge.hns` (to be changed).

All permissions are allowed, making testing easier. This can be enabled with `client.loadMySky(<hostApp>, { dev: true })`.

## Debug

You can also enable debug messages with `client.loadMySky(<hostApp>, { debug: true })`. Both `dev` and `debug` can be set.

## Deployment

Set the `RESOLVER_SEED` env var:

```
export RESOLVER_SEED="..."
```

and run the deploy script:

```
npm run deploy
```

You can check the `version.json` file on the live site to see the latest git commit it was built with, e.g. `skynet-mysky.hns.siasky.net/version.json`.

### Dev Deploy

```
npm run deploy-dev
```

### Alpha Deploy

```
npm run deploy-alpha
```

## Changelog

[Changelog](./CHANGELOG.md)
