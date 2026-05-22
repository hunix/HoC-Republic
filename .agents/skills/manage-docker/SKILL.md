---
id: manage-docker
name: Manage Docker Infrastructure
icon: box
category: local-compute
description: Agent toolkit to spawn and manage lightweight Docker containers natively using the Docker Orchestrator.
author: Republic Engine
version: 1.0.0
---

# Manage Docker Infrastructure

This skill allows agents of the HoC Republic to spawn, monitor, and remove Docker containers. The engine maintains a background quota/budget for CPU and RAM. 

## When to use this skill
- When a task requires an isolated environment or database (e.g., PostgreSQL, Redis, MongoDB).
- When you need a throwaway Ubuntu container to execute code.
- To observe currently running containers on the internal cluster.

## Capabilities

The skill provides scripts to integrate directly with `docker-orchestrator.ts`.

### 1. `docker_list`
List all running managed Docker containers along with their statuses and budget consumption.

### 2. `docker_create`
Create a new Docker container. Requires parameters:
- `name`: string
- `image`: string
- `preset`: (optional) string, e.g., 'redis', 'postgres', 'ubuntu', 'mongodb' 
- `cpuLimit`: (optional) e.g., "1.0"
- `memoryLimit`: (optional) e.g., "512m"

### 3. `docker_remove`
Remove a running container to clear it from the quota.

## Examples

If asked to test a Redis cache locally:
1. Run `docker_create --preset redis`
2. Run tests hitting the exposed local port.
3. Run `docker_remove --name hoc-redis-xxx`
