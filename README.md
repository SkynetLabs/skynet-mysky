[![CI](https://github.com/SkynetLabs/skynet-mysky/actions/workflows/ci.yml/badge.svg)](https://github.com/SkynetLabs/skynet-mysky/actions/workflows/ci.yml)

# skynet-mysky

This is the repo that contains the MySky invisible element, MySky UI, the default permissions provider, and the default seed provider.

MySky domain: `skynet-mysky.hns`

## Docs

For API docs please refer to the [SDK docs](https://siasky.net/docs/#mysky).

For an interactive workshop, look [here](https://app.gitbook.com/@skynet-labs/s/skynet-developer-guide/skynet-workshops/introduction-workshop).

## Dev

The Dev domain is: `skynet-mysky-dev.hns`.

All permissions are allowed, making testing easier. This can be enabled with `client.loadMySky(<hostApp>, { dev: true })`.

## Debug

You can also enable debug messages with `client.loadMySky(<hostApp>, { debug: true })`. Both `dev` and `debug` can be
set.

## Deployment process

### Preparation

- Make your changes to `skynet-mysky`
- Link any changes e.g. to `skynet-js` that are being tested (`npm link`)
- Set the `RESOLVER_SEED` env var (you can find the value in LastPass under `MySky Seed`):

```
export RESOLVER_SEED="..."
```

### Deploy Alpha (sandbridge.hns)

```
npm run deploy-alpha
```

### Run integration tests for Alpha

- Follow https://github.com/SkynetLabs/test-skapp

Secrets found in LastPass under `MySky Test Skapp`.

### Deploy dev (skynet-mysky-dev.hns)

```
npm run deploy-dev
```

### Deploy production (skynet-mysky.hns)

```
npm run deploy
```

## Notes

- You can find out what is currently deployed at prod, dev, or alpha by pinging `version.json`,
  e.g. https://skynet-mysky.hns.siasky.net/version.json

## Changelog

[Changelog](./CHANGELOG.md)
