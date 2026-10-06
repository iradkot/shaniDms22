# ShaniDms

Android, iOS and Web views of a user's Nightscout glucose and therapy data.

## Start here

- **Adding a data feature? Read [Data access and calculations](docs/DATA_ACCESS.md).**
  It identifies the existing loaders, calculators, time conventions and quality
  rules. Do not implement another insulin sum or Nightscout paging loop in a view.
- [Product vocabulary](CONTEXT.md) and [architecture decisions](docs/adr/).
- [Product feedback and priorities](docs/PRODUCT_FEEDBACK.md): recorded pilot
  feedback, next development tasks and contributor access boundaries.
- [Build and release](docs/BUILD_AND_RELEASE.md), [Web](docs/WEB_FRONTEND.md),
  [end-to-end checks](docs/E2E.md).
- [Daily summary data contract](docs/DAILY_SUMMARY_DATA.md),
  [Android widget](docs/android-summary-widget.md),
  [Day Graph architecture](docs/DAY_GRAPH_ARCHITECTURE.md).

Install with the repository's Yarn version (`yarn install --immutable`).
Use `yarn android` for Android, `yarn web` for Web, and `yarn verify:all` for the
complete quality checks. Platform build prerequisites are in the build guide.
