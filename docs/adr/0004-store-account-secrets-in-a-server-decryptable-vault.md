# Store account secrets in a server-decryptable vault

Nightscout and LLM credentials synchronise through an encrypted account vault so a Product User can move between mobile and web without re-entering them. The ShaniDms backend may decrypt credentials through managed keys and strict access controls; credentials must not be stored as plaintext Firestore fields or exposed to a web client when a backend request adapter can use them instead. This chooses a simpler account experience over end-to-end encryption that only the Product User can unlock.
