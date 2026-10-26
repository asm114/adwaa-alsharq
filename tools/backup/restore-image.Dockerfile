# syntax=docker/dockerfile:1
# Blank PostgreSQL cluster, not a pre-initialized Supabase production instance.
FROM postgres:17-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27 AS build
ARG VAULT_COMMIT=6e0cd916242d922a646e4d611cc215e09dd429f4
ARG VAULT_SHA256=bb7b43726aa08a2ca8e4205cd3961d373cb4287a4469fa06929f00939a1b1fc4
RUN --mount=type=secret,id=ca_bundle \
    set -eu; \
    if [ -f /run/secrets/ca_bundle ]; then \
      export CURL_CA_BUNDLE=/run/secrets/ca_bundle; \
      printf 'Acquire::https::CaInfo "/run/secrets/ca_bundle";\n' > /tmp/apt-ca.conf; \
    else touch /tmp/apt-ca.conf; fi; \
    apt-get -c /tmp/apt-ca.conf update; \
    apt-get -c /tmp/apt-ca.conf install -y --no-install-recommends build-essential postgresql-server-dev-17 libsodium-dev curl ca-certificates; \
    curl --fail --silent --show-error --location "https://codeload.github.com/supabase/vault/tar.gz/$VAULT_COMMIT" -o /tmp/vault.tar.gz; \
    echo "$VAULT_SHA256  /tmp/vault.tar.gz" | sha256sum -c -; \
    mkdir /tmp/vault; tar -xzf /tmp/vault.tar.gz -C /tmp/vault --strip-components=1; \
    make -C /tmp/vault; make -C /tmp/vault install; \
    mkdir /runtime-libs; cp -L /usr/lib/*/libsodium.so.23 /runtime-libs/libsodium.so.23

FROM postgres:17-bookworm@sha256:858bb5e98eed02eb8cafbcdc007f9a65d1b613972028944a8ec2133ccaf80d27
COPY --from=build /usr/lib/postgresql/17/lib/supabase_vault.so /usr/lib/postgresql/17/lib/supabase_vault.so
COPY --from=build /usr/share/postgresql/17/extension/supabase_vault* /usr/share/postgresql/17/extension/
COPY --from=build /runtime-libs/libsodium.so.23 /usr/local/lib/libsodium.so.23
RUN ldconfig
