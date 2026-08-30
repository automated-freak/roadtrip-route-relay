# Wireframes — Route Relay

Rough, low-fidelity wireframes for the three screens in Phase 1. They are **not**
pixel designs — they capture layout, hierarchy, and the key interactions so Phase 2
(the frontend shell) doesn't drift.

All three screens run in **Safari on iPhone** and are designed **mobile-first, dark-mode
friendly**, with large touch targets (glove-friendly for the driver).

| File | Screen | Who sees it |
|------|--------|-------------|
| `01-landing.svg` | Landing / create-or-join | Everyone, once per trip |
| `02-passenger.svg` | Passenger view | "I'm riding" members |
| `03-driver.svg` | Driver view | "I'm driving" member (phone mirrored to CarPlay) |

## Shared visual language

- **Gray boxes** = input fields or placeholders (text not yet entered).
- **Dark filled boxes** = primary action buttons (tappable).
- **Light filled boxes** = secondary actions.
- **Red text** = annotation explaining a behavior (not part of the real UI).
- One screen can be **both** a passenger and driver in the same trip; the role only
  picks which *view* the device opens by default. Any member can still submit a route.

## Interaction notes carried into the spec

- **Landing → passenger/driver** is decided by the self-selected role, not an account.
- **Passenger** "Add a stop" expands an input panel; the queue below is live.
- **Driver** queue items are large; one tap launches navigation, and the screen stays
  awake (Screen Wake Lock API).
