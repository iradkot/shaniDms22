# Use platform-specific Nightscout paths and a shared LLM proxy

Mobile clients call Nightscout directly using a credential cached in secure local storage, while the web client uses a stateless ShaniDms proxy so a persistent Nightscout credential is not exposed to browser code. All platforms call LLM providers through the ShaniDms backend. The proxy may process request data transiently but must not persist raw Nightscout history; this avoids making mobile Nightscout access depend on ShaniDms availability while centralising browser and LLM credential protection.
