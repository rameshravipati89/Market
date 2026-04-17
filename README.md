# MongoDB Docker / Podman Setup

## Quick Start

```bash
bash build_setup.sh
```

## Connection Details

| Field       | Value                        |
|-------------|------------------------------|
| Host        | localhost                    |
| Port        | 27017                        |
| Username    | admin                        |
| Password    | admin123                     |
| Database    | mydb                         |
| Auth Source | admin                        |

## Connection URI

```
mongodb://admin:admin123@localhost:27017/mydb?authSource=admin
```

## Supported Platforms

| Platform              | Runtime        | Notes                              |
|-----------------------|----------------|------------------------------------|
| macOS (local)         | Podman         | Auto-starts Podman machine         |
| Linux VM              | Podman         | Rootless with --userns=keep-id     |
| Linux VM              | Docker         | Auto-starts daemon via systemctl   |
| Windows (WSL2)        | Docker/Podman  | Detected via /proc/version         |

## Useful Commands

```bash
# View logs
podman logs -f mongodb_instance

# Open MongoDB shell
podman exec -it mongodb_instance mongosh -u admin -p admin123

# Stop container
podman stop mongodb_instance

# Remove container
podman rm -f mongodb_instance
```

## docker-compose (alternative)

```bash
podman-compose up -d
# or
docker-compose up -d
```
