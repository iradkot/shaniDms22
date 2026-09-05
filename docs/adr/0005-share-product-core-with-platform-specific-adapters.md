# Share the product core and allow platform-specific adapters

Mobile, tablet, and web share the domain model, offline and synchronisation behaviour, navigation descriptors, design system, and suitable responsive UI Modules. Platform capabilities and interactions use dedicated adapters or implementations when needed; the project does not force every native screen through one identical web UI. This preserves shared behaviour while allowing touch, desktop, notification, camera, and storage experiences to fit their platform.
