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

### Dev Build

```
npm run build-dev
```
