using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Linq;
using System.Net;
using System.Net.Sockets;
using System.Threading;
using System.Threading.Tasks;
using System.Text.Json;

namespace OpenClaw.Republic
{
    /// <summary>
    /// Distributed coordination for multi-device deployment
    /// Enables P2P mesh network with gossip protocol
    /// </summary>
    
    public class DistributedCoordinator
    {
        private readonly string _deviceId;
        private readonly ConcurrentDictionary<string, PeerNode> _peers;
        private readonly GossipProtocol _gossip;
        private readonly SwarmCoordinator _swarm;
        private readonly CoordinationConfig _config;
        private CancellationTokenSource _cancellationTokenSource;
        
        public DistributedCoordinator(string deviceId, CoordinationConfig config = null)
        {
            _deviceId = deviceId;
            _config = config ?? CoordinationConfig.Default;
            _peers = new ConcurrentDictionary<string, PeerNode>();
            _gossip = new GossipProtocol(_deviceId, _peers, _config);
            _swarm = new SwarmCoordinator(_deviceId, _peers);
        }
        
        public async Task StartCoordination()
        {
            _cancellationTokenSource = new CancellationTokenSource();
            
            // Start gossip protocol
            _ = Task.Run(() => _gossip.RunGossipLoop(_cancellationTokenSource.Token));
            
            // Start peer discovery
            _ = Task.Run(() => DiscoverPeers(_cancellationTokenSource.Token));
            
            Console.WriteLine($"[DistributedCoordinator] Started on device {_deviceId}");
        }
        
        public async Task StopCoordination()
        {
            _cancellationTokenSource?.Cancel();
            Console.WriteLine($"[DistributedCoordinator] Stopped");
        }
        
        private async Task DiscoverPeers(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    // Broadcast discovery message on local network
                    await BroadcastDiscovery();
                    
                    // Listen for discovery responses
                    await ListenForDiscovery();
                    
                    await Task.Delay(TimeSpan.FromSeconds(30), cancellationToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[DistributedCoordinator] Discovery error: {ex.Message}");
                }
            }
        }
        
        private async Task BroadcastDiscovery()
        {
            using var udpClient = new UdpClient();
            udpClient.EnableBroadcast = true;
            
            var message = new DiscoveryMessage
            {
                DeviceId = _deviceId,
                Timestamp = DateTime.UtcNow,
                Endpoint = GetLocalEndpoint()
            };
            
            var json = JsonSerializer.Serialize(message);
            var bytes = System.Text.Encoding.UTF8.GetBytes(json);
            
            await udpClient.SendAsync(bytes, bytes.Length, new IPEndPoint(IPAddress.Broadcast, _config.DiscoveryPort));
        }
        
        private async Task ListenForDiscovery()
        {
            using var udpClient = new UdpClient(_config.DiscoveryPort);
            udpClient.Client.ReceiveTimeout = 5000;
            
            try
            {
                var result = await udpClient.ReceiveAsync();
                var json = System.Text.Encoding.UTF8.GetString(result.Buffer);
                var message = JsonSerializer.Deserialize<DiscoveryMessage>(json);
                
                if (message.DeviceId != _deviceId)
                {
                    // Add peer
                    _peers.TryAdd(message.DeviceId, new PeerNode
                    {
                        DeviceId = message.DeviceId,
                        Endpoint = message.Endpoint,
                        LastSeen = DateTime.UtcNow,
                        IsActive = true
                    });
                    
                    Console.WriteLine($"[DistributedCoordinator] Discovered peer: {message.DeviceId}");
                }
            }
            catch (SocketException)
            {
                // Timeout, no peers found
            }
        }
        
        private string GetLocalEndpoint()
        {
            var host = Dns.GetHostEntry(Dns.GetHostName());
            var localIp = host.AddressList.FirstOrDefault(ip => ip.AddressFamily == AddressFamily.InterNetwork);
            return $"{localIp}:{_config.CoordinationPort}";
        }
        
        public async Task<bool> SyncState(StateUpdate update)
        {
            return await _gossip.PropagateUpdate(update);
        }
        
        public async Task<List<SwarmTask>> CoordinateSwarm(SwarmObjective objective)
        {
            return await _swarm.CoordinateSwarm(objective);
        }
    }
    
    #region Gossip Protocol
    
    public class GossipProtocol
    {
        private readonly string _deviceId;
        private readonly ConcurrentDictionary<string, PeerNode> _peers;
        private readonly CoordinationConfig _config;
        private readonly ConcurrentDictionary<Guid, StateUpdate> _recentUpdates;
        
        public GossipProtocol(string deviceId, ConcurrentDictionary<string, PeerNode> peers, CoordinationConfig config)
        {
            _deviceId = deviceId;
            _peers = peers;
            _config = config;
            _recentUpdates = new ConcurrentDictionary<Guid, StateUpdate>();
        }
        
        public async Task RunGossipLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await GossipRound();
                    await Task.Delay(TimeSpan.FromSeconds(10), cancellationToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[GossipProtocol] Error: {ex.Message}");
                }
            }
        }
        
        private async Task GossipRound()
        {
            if (_peers.Count == 0) return;
            
            // Select random peer
            var peer = SelectRandomPeer();
            if (peer == null) return;
            
            // Exchange state updates
            var myUpdates = GetRecentUpdates();
            var peerUpdates = await RequestPeerUpdates(peer);
            
            // Merge updates
            foreach (var update in peerUpdates)
            {
                if (!_recentUpdates.ContainsKey(update.Id))
                {
                    _recentUpdates.TryAdd(update.Id, update);
                    // Apply update locally
                    await ApplyUpdate(update);
                }
            }
            
            // Send our updates to peer
            await SendUpdatesToPeer(peer, myUpdates);
        }
        
        private PeerNode SelectRandomPeer()
        {
            var activePeers = _peers.Values.Where(p => p.IsActive).ToList();
            if (activePeers.Count == 0) return null;
            
            var index = Random.Shared.Next(activePeers.Count);
            return activePeers[index];
        }
        
        private List<StateUpdate> GetRecentUpdates()
        {
            var cutoff = DateTime.UtcNow.AddMinutes(-5);
            return _recentUpdates.Values
                .Where(u => u.Timestamp > cutoff)
                .ToList();
        }
        
        private async Task<List<StateUpdate>> RequestPeerUpdates(PeerNode peer)
        {
            // TODO: Implement HTTP/gRPC communication
            // For now, return empty list
            return new List<StateUpdate>();
        }
        
        private async Task SendUpdatesToPeer(PeerNode peer, List<StateUpdate> updates)
        {
            // TODO: Implement HTTP/gRPC communication
        }
        
        private async Task ApplyUpdate(StateUpdate update)
        {
            // Apply the update to local state
            Console.WriteLine($"[GossipProtocol] Applied update: {update.Type} from {update.SourceDevice}");
        }
        
        public async Task<bool> PropagateUpdate(StateUpdate update)
        {
            update.Id = Guid.NewGuid();
            update.SourceDevice = _deviceId;
            update.Timestamp = DateTime.UtcNow;
            
            _recentUpdates.TryAdd(update.Id, update);
            
            // Will be propagated in next gossip round
            return true;
        }
    }
    
    public class StateUpdate
    {
        public Guid Id { get; set; }
        public string SourceDevice { get; set; }
        public DateTime Timestamp { get; set; }
        public StateUpdateType Type { get; set; }
        public object Data { get; set; }
    }
    
    public enum StateUpdateType
    {
        AgentCreated,
        AgentUpdated,
        AgentDeleted,
        EventScheduled,
        LawPassed,
        ElectionHeld,
        ResourcePurchased
    }
    
    #endregion
    
    #region Swarm Coordination
    
    public class SwarmCoordinator
    {
        private readonly string _deviceId;
        private readonly ConcurrentDictionary<string, PeerNode> _peers;
        
        public SwarmCoordinator(string deviceId, ConcurrentDictionary<string, PeerNode> peers)
        {
            _deviceId = deviceId;
            _peers = peers;
        }
        
        public async Task<List<SwarmTask>> CoordinateSwarm(SwarmObjective objective)
        {
            // Divide objective into tasks
            var tasks = DecomposeObjective(objective);
            
            // Assign tasks to devices based on capacity
            var assignments = AssignTasks(tasks);
            
            // Distribute tasks to peers
            await DistributeTasks(assignments);
            
            return tasks;
        }
        
        private List<SwarmTask> DecomposeObjective(SwarmObjective objective)
        {
            var tasks = new List<SwarmTask>();
            
            switch (objective.Type)
            {
                case ObjectiveType.ResourceGathering:
                    // Create tasks for each device to gather resources
                    var devicesCount = _peers.Count + 1;  // +1 for self
                    var tasksPerDevice = objective.TargetAmount / devicesCount;
                    
                    for (int i = 0; i < devicesCount; i++)
                    {
                        tasks.Add(new SwarmTask
                        {
                            Id = Guid.NewGuid(),
                            Type = SwarmTaskType.GatherResources,
                            TargetAmount = tasksPerDevice,
                            AssignedDevice = null  // Will be assigned later
                        });
                    }
                    break;
                
                case ObjectiveType.KnowledgeDiscovery:
                    // Create exploration tasks
                    tasks.Add(new SwarmTask
                    {
                        Id = Guid.NewGuid(),
                        Type = SwarmTaskType.Explore,
                        Data = objective.Data
                    });
                    break;
            }
            
            return tasks;
        }
        
        private Dictionary<string, List<SwarmTask>> AssignTasks(List<SwarmTask> tasks)
        {
            var assignments = new Dictionary<string, List<SwarmTask>>();
            
            // Simple round-robin assignment
            var devices = new List<string> { _deviceId };
            devices.AddRange(_peers.Keys);
            
            for (int i = 0; i < tasks.Count; i++)
            {
                var deviceId = devices[i % devices.Count];
                tasks[i].AssignedDevice = deviceId;
                
                if (!assignments.ContainsKey(deviceId))
                {
                    assignments[deviceId] = new List<SwarmTask>();
                }
                assignments[deviceId].Add(tasks[i]);
            }
            
            return assignments;
        }
        
        private async Task DistributeTasks(Dictionary<string, List<SwarmTask>> assignments)
        {
            foreach (var kvp in assignments)
            {
                if (kvp.Key == _deviceId)
                {
                    // Execute locally
                    await ExecuteTasksLocally(kvp.Value);
                }
                else
                {
                    // Send to peer
                    await SendTasksToPeer(kvp.Key, kvp.Value);
                }
            }
        }
        
        private async Task ExecuteTasksLocally(List<SwarmTask> tasks)
        {
            foreach (var task in tasks)
            {
                Console.WriteLine($"[SwarmCoordinator] Executing task: {task.Type}");
                // TODO: Execute task
            }
        }
        
        private async Task SendTasksToPeer(string peerId, List<SwarmTask> tasks)
        {
            // TODO: Implement HTTP/gRPC communication
            Console.WriteLine($"[SwarmCoordinator] Sending {tasks.Count} tasks to {peerId}");
        }
    }
    
    public class SwarmObjective
    {
        public ObjectiveType Type { get; set; }
        public decimal TargetAmount { get; set; }
        public object Data { get; set; }
    }
    
    public enum ObjectiveType
    {
        ResourceGathering,
        KnowledgeDiscovery,
        DefenseOperation,
        BuildingConstruction
    }
    
    public class SwarmTask
    {
        public Guid Id { get; set; }
        public SwarmTaskType Type { get; set; }
        public decimal TargetAmount { get; set; }
        public object Data { get; set; }
        public string AssignedDevice { get; set; }
        public SwarmTaskStatus Status { get; set; }
    }
    
    public enum SwarmTaskType
    {
        GatherResources,
        Explore,
        Defend,
        Build,
        Research
    }
    
    public enum SwarmTaskStatus
    {
        Pending,
        InProgress,
        Completed,
        Failed
    }
    
    #endregion
    
    #region Supporting Classes
    
    public class PeerNode
    {
        public string DeviceId { get; set; }
        public string Endpoint { get; set; }
        public DateTime LastSeen { get; set; }
        public bool IsActive { get; set; }
        public int AgentCount { get; set; }
        public decimal CPUUsage { get; set; }
        public decimal MemoryUsage { get; set; }
    }
    
    public class DiscoveryMessage
    {
        public string DeviceId { get; set; }
        public DateTime Timestamp { get; set; }
        public string Endpoint { get; set; }
    }
    
    public class CoordinationConfig
    {
        public int DiscoveryPort { get; set; } = 7890;
        public int CoordinationPort { get; set; } = 7891;
        public TimeSpan GossipInterval { get; set; } = TimeSpan.FromSeconds(10);
        public TimeSpan PeerTimeout { get; set; } = TimeSpan.FromMinutes(5);
        
        public static CoordinationConfig Default => new CoordinationConfig();
    }
    
    #endregion
    
    #region Swarm Intelligence Behaviors
    
    public class SwarmBehaviors
    {
        /// <summary>
        /// Boids algorithm for flocking behavior
        /// </summary>
        public static Vector2 CalculateFlocking(Tier1Agent agent, List<Tier1Agent> neighbors)
        {
            if (neighbors.Count == 0) return new Vector2(0, 0);
            
            var separation = CalculateSeparation(agent, neighbors);
            var alignment = CalculateAlignment(agent, neighbors);
            var cohesion = CalculateCohesion(agent, neighbors);
            
            return new Vector2(
                separation.X * 1.5f + alignment.X * 1.0f + cohesion.X * 1.0f,
                separation.Y * 1.5f + alignment.Y * 1.0f + cohesion.Y * 1.0f
            );
        }
        
        private static Vector2 CalculateSeparation(Tier1Agent agent, List<Tier1Agent> neighbors)
        {
            var force = new Vector2(0, 0);
            
            foreach (var neighbor in neighbors)
            {
                var distance = Distance(agent, neighbor);
                if (distance < 10)  // Too close
                {
                    var dx = agent.State.LocationX - neighbor.State.LocationX;
                    var dy = agent.State.LocationY - neighbor.State.LocationY;
                    force.X += dx / distance;
                    force.Y += dy / distance;
                }
            }
            
            return force;
        }
        
        private static Vector2 CalculateAlignment(Tier1Agent agent, List<Tier1Agent> neighbors)
        {
            // Average velocity of neighbors
            // (Simplified: just return center direction)
            return new Vector2(0, 0);
        }
        
        private static Vector2 CalculateCohesion(Tier1Agent agent, List<Tier1Agent> neighbors)
        {
            // Move towards center of mass
            var centerX = neighbors.Average(n => n.State.LocationX);
            var centerY = neighbors.Average(n => n.State.LocationY);
            
            return new Vector2(
                (centerX - agent.State.LocationX) * 0.01f,
                (centerY - agent.State.LocationY) * 0.01f
            );
        }
        
        private static float Distance(Tier1Agent a, Tier1Agent b)
        {
            var dx = a.State.LocationX - b.State.LocationX;
            var dy = a.State.LocationY - b.State.LocationY;
            return (float)Math.Sqrt(dx * dx + dy * dy);
        }
    }
    
    public struct Vector2
    {
        public float X;
        public float Y;
        
        public Vector2(float x, float y)
        {
            X = x;
            Y = y;
        }
    }
    
    #endregion
}
