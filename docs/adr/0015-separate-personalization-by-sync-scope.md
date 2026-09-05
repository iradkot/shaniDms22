# ADR 0015: Separate personalisation by sync scope

- Status: Accepted
- Date: 2026-08-30

## Decision

Persist Product Personalisation as four explicit sections:

- **Account**: ordered Favorite Destinations, without a hard limit.
- **Workspace**: optional Relationship to Data Subject and questionnaire state.
- **Layout**: one synchronised Layout Profile for Phone, Tablet, and Desktop.
- **Device**: Recent Modules, kept local to that device and capped at 20.

Each Layout Profile owns its Hub-or-destination start choice, Current Snapshot
visibility, Recents visibility, and up to two Shell shortcuts. A Product User may
therefore arrange the same account differently on a phone, tablet, and desktop.

The onboarding presets only suggest an editable starting arrangement. They do
not hide Modules, change permissions, or affect clinical conclusions.

## Consequences

Adapters can synchronise Account, Workspace, and individual Layout scopes
without uploading device recents. The strict parser rejects unknown and
transient fields, while reusing the Destination and Shell persistence parsers.
