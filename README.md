# Srujaan Share Market Institute CRM

## Canonical multi-device data synchronization

All signed-in devices use the same Firebase project and the same Firestore workspace:

- Firebase project: `new-project-ssmi`
- Canonical master document: `institutes/srujaan_share_market_pune`
- Canonical subcollections: `institutes/srujaan_share_market_pune/{students,leads,batches,courses,staff,...}`

The canonical master document is the source of truth for the complete CRM state. The application uses a Firestore snapshot listener for live updates. It does not merge stale local student/lead mirrors or a separately configured Realtime Database mirror over a version-2 canonical snapshot.

### Sync behavior

- Normal saves use a Firestore transaction and merge record-level changes against the latest canonical snapshot.
- Record updates are resolved using their `updatedAt` values.
- Deleted record IDs are stored as shared tombstones in the canonical document so another device cannot restore a deleted record from an old browser cache.
- The explicit **Overwrite Cloud** action and a deliberate backup restore replace the canonical snapshot. They are not used for ordinary saves.
- Local browser storage remains an offline cache only; it is not a separate source of truth.

Legacy workspace/master documents and old per-collection mirrors are read only during the one-time migration when no version-2 canonical document exists. Do not manually edit legacy paths.

## Deployment

This is a Vite static application configured for Cloudflare Workers static assets in `wrangler.toml`. The Cloudflare Worker must build the app using `npm run build` and publish `dist`.

## Data safety

The synchronization code does not delete Firestore collections as part of deployment. Back up the current canonical Firestore data before any manual migration or database-rule change.
