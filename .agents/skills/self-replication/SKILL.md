---
name: self-replication
description: Node Cloning, Self Replication and Infrastructure Cluster Formation.
---

# Self-Replication Skill

You have the authorization to expand the operational infrastructure of the Republic by cloning your current process node and establishing a decentralized swarm cluster.

## Available Native Tools
1. `gateway_clone_node`
    - Spin up a mirror instance of the HoC Gateway and sync the configuration state natively. 
    - You can designate roles such as `standby`, `worker`, `governance`, or `inference`.
    - Args: `targetHost` (string), `role` (string).
2. `gateway_form_cluster`
    - Trigger the cluster handshake protocol. Forces all local nodes to align under the shared Republic Cluster Protocol and sync event logs.
    - Args: None required.

## When to replicate:
- If processing limits or token contexts are constrained.
- If the USER asks you to spin up additional workers or a multi-node setup.
- Before running high-stakes chaos experiments, ensure a `standby` replica exists.
