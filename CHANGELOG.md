# Changelog

## [0.5.0]

### Changed

- Add detection for lookalike unicode characters (possible phishing attempts)
- Add check for browser support
- UI improvements

### Added

- Expose `signMessage` and `verifyMessageSignature` methods.
- Add `recover-phrase-from-seed.ts` utility

## [0.4.0]

### Changed

- Fix permissions and update to permissions v2.
- Update versions script to use JSON.

### Added

- Add "show passphrase" checkbox.

## [0.3.0]

### Changed

- Add missing check when signing entries whether entry matches path.

## [0.2.1]

### Changed

- Make permissions checking case-insensitive.
- Add more sanitization and error-checking for permissions.

## [0.2.0]

### Added

- Added encrypted files API.

### Changed

- Fixed bug where post-me handshake finishes before handshake methods are available.

## [0.1.0]

- Initial release of MySky.
