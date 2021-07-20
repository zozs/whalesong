# Authentication

The recommended way is to have whalesong only listen to the loopback interface. In this case, you normally don't need to enable any authentication.

There are two main situations where authentication may be required:

1. The system running whalesong has multiple users, and not everyone should have full access to the registry, or
2. Whalesong is listening on a wildcard address, and is exposed to multiple hosts.

If you need authentication, you need to:

* Serve the whalesong API over a TLS connection (docker will refuse to send credentials over an unencrypted connection). Whalesong has no built-in TLS support, you need a reverse proxy in front of it.
* Decide some credentials
* Set the `WHALESONG_EXTERNAL_URL` environmental variable, to the correct host and port that will be used for external access, for example `WHALESONG_EXTERNAL_URL=https://registry.example.com:5006`.

There is currently no way to require authentication only for pushes, so enabling authentication will require you to use credentials both for pushing and pulling.

## Caddy example

Assuming whalesong is running and listening on `localhost:5005`, an example `Caddyfile` (to be used with [Caddy](https://caddyserver.com)) could be:

```
{
  auto_https disable_redirects
}

:5006 {
    tls test.example.com/fullchain.cer test.example.com.key
    reverse_proxy localhost:5005
    basicauth {
        testuser JDJhJDE0JEoxNjVCLnQ0WlJva2F3VVdDMXdiT084WWNQTG13MzlGS0JhQjV4c2o1UmtHU2RlQXIvQkYy
    }
}
```

You can of course use Caddy's automatic TLS certificates if you desire. Or use something completely different as a reverse proxy, such as nginx.
