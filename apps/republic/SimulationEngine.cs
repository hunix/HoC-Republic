using System;
using System.Collections.Generic;
using System.Collections.Concurrent;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.IO;
using System.Text.Json;

namespace OpenClaw.Republic
{
    /// <summary>
    /// Time-sliced simulation engine with hibernation
    /// Enables thousands of agents on limited hardware through event-driven architecture
    /// </summary>
    
    public class SimulationEngine
    {
        private readonly PriorityQueue<ScheduledEvent, DateTime> _eventQueue;
        private readonly ConcurrentDictionary<Guid, AgentSnapshot> _hibernatedAgents;
        private readonly ConcurrentDictionary<Guid, Tier1Agent> _activeAgents;
        private readonly AgentHibernationManager _hibernationManager;
        private readonly SimulationConfig _config;
        private readonly SemaphoreSlim _simulationLock;
        private CancellationTokenSource _cancellationTokenSource;
        private Task _simulationTask;
        
        // Statistics
        public SimulationStatistics Stats { get; private set; }
        
        public SimulationEngine(SimulationConfig config = null)
        {
            _config = config ?? SimulationConfig.Default;
            _eventQueue = new PriorityQueue<ScheduledEvent, DateTime>();
            _hibernatedAgents = new ConcurrentDictionary<Guid, AgentSnapshot>();
            _activeAgents = new ConcurrentDictionary<Guid, Tier1Agent>();
            _hibernationManager = new AgentHibernationManager(_config);
            _simulationLock = new SemaphoreSlim(1, 1);
            Stats = new SimulationStatistics();
        }
        
        #region Simulation Control
        
        public async Task StartSimulation()
        {
            if (_simulationTask != null && !_simulationTask.IsCompleted)
            {
                throw new InvalidOperationException("Simulation is already running");
            }
            
            _cancellationTokenSource = new CancellationTokenSource();
            _simulationTask = Task.Run(() => RunSimulationLoop(_cancellationTokenSource.Token));
            
            Console.WriteLine($"[SimulationEngine] Started with {_hibernatedAgents.Count} hibernated agents");
        }
        
        public async Task StopSimulation()
        {
            _cancellationTokenSource?.Cancel();
            if (_simulationTask != null)
            {
                await _simulationTask;
            }
            
            // Hibernate all active agents
            await HibernateAllActiveAgents();
            
            Console.WriteLine($"[SimulationEngine] Stopped. Final stats: {Stats}");
        }
        
        private async Task RunSimulationLoop(CancellationToken cancellationToken)
        {
            while (!cancellationToken.IsCancellationRequested)
            {
                try
                {
                    await ProcessNextEvent(cancellationToken);
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SimulationEngine] Error in simulation loop: {ex.Message}");
                    Stats.ErrorCount++;
                }
            }
        }
        
        #endregion
        
        #region Event Processing
        
        private async Task ProcessNextEvent(CancellationToken cancellationToken)
        {
            await _simulationLock.WaitAsync(cancellationToken);
            
            try
            {
                // Check if there are events to process
                if (_eventQueue.Count == 0)
                {
                    // No events, sleep for a bit
                    await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
                    return;
                }
                
                // Peek at next event
                if (!_eventQueue.TryPeek(out var nextEvent, out var scheduledTime))
                {
                    return;
                }
                
                // Check if it's time to process this event
                var now = DateTime.UtcNow;
                if (scheduledTime > now)
                {
                    // Event is in the future, sleep until then
                    var delay = scheduledTime - now;
                    if (delay > TimeSpan.FromSeconds(10))
                    {
                        delay = TimeSpan.FromSeconds(10);  // Max sleep 10 seconds
                    }
                    await Task.Delay(delay, cancellationToken);
                    return;
                }
                
                // Dequeue and process the event
                _eventQueue.Dequeue();
                await ProcessEvent(nextEvent, now);
                
                Stats.EventsProcessed++;
            }
            finally
            {
                _simulationLock.Release();
            }
        }
        
        private async Task ProcessEvent(ScheduledEvent evt, DateTime currentTime)
        {
            var startTime = DateTime.UtcNow;
            
            // Wake up affected agents
            var agents = await WakeAgents(evt.AffectedAgentIds);
            
            // Process event for each agent
            foreach (var agent in agents)
            {
                try
                {
                    // Update agent state based on time passed
                    agent.ProcessTick(currentTime);
                    
                    // Process the specific event
                    agent.ProcessEvent(evt);
                    
                    // Schedule next events for this agent
                    var newEvents = GenerateNextEvents(agent, currentTime);
                    foreach (var newEvent in newEvents)
                    {
                        _eventQueue.Enqueue(newEvent, newEvent.ScheduledTime);
                    }
                    
                    Stats.AgentUpdates++;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[SimulationEngine] Error processing event for agent {agent.Identity.Id}: {ex.Message}");
                    Stats.ErrorCount++;
                }
            }
            
            // Hibernate agents that don't need to stay active
            await HibernateInactiveAgents(agents, currentTime);
            
            var processingTime = DateTime.UtcNow - startTime;
            Stats.TotalProcessingTime += processingTime;
            Stats.AverageEventProcessingTime = Stats.TotalProcessingTime / Stats.EventsProcessed;
        }
        
        private List<ScheduledEvent> GenerateNextEvents(Tier1Agent agent, DateTime currentTime)
        {
            var events = new List<ScheduledEvent>();
            
            // Schedule next tick based on activity
            var nextTickDelay = agent.State.CurrentActivity switch
            {
                Activity.Sleeping => TimeSpan.FromHours(8),
                Activity.Working => TimeSpan.FromHours(8),
                Activity.Socializing => TimeSpan.FromHours(2),
                Activity.Learning => TimeSpan.FromHours(4),
                Activity.Eating => TimeSpan.FromMinutes(30),
                Activity.Resting => TimeSpan.FromHours(1),
                _ => TimeSpan.FromHours(1)
            };
            
            events.Add(new ScheduledEvent
            {
                EventId = Guid.NewGuid(),
                Type = EventType.Other,  // Generic tick event
                ScheduledTime = currentTime + nextTickDelay,
                AffectedAgentIds = new List<Guid> { agent.Identity.Id }
            });
            
            // Schedule random social events
            if (Random.Shared.NextDouble() < 0.1)  // 10% chance
            {
                events.Add(new ScheduledEvent
                {
                    EventId = Guid.NewGuid(),
                    Type = EventType.Friendship,
                    ScheduledTime = currentTime + TimeSpan.FromHours(Random.Shared.Next(1, 24)),
                    AffectedAgentIds = new List<Guid> { agent.Identity.Id }
                });
            }
            
            return events;
        }
        
        #endregion
        
        #region Agent Lifecycle Management
        
        public async Task<Guid> CreateAgent(Specialization specialization)
        {
            var agent = new Tier1Agent(specialization);
            
            // Add initial events
            var initialEvents = new List<ScheduledEvent>
            {
                new ScheduledEvent
                {
                    EventId = Guid.NewGuid(),
                    Type = EventType.Birth,
                    ScheduledTime = DateTime.UtcNow,
                    AffectedAgentIds = new List<Guid> { agent.Identity.Id }
                },
                new ScheduledEvent
                {
                    EventId = Guid.NewGuid(),
                    Type = EventType.Education,
                    ScheduledTime = DateTime.UtcNow.AddHours(1),
                    AffectedAgentIds = new List<Guid> { agent.Identity.Id }
                }
            };
            
            foreach (var evt in initialEvents)
            {
                _eventQueue.Enqueue(evt, evt.ScheduledTime);
            }
            
            // Immediately hibernate the agent
            var snapshot = AgentSnapshot.Create(agent);
            _hibernatedAgents[agent.Identity.Id] = snapshot;
            
            Stats.TotalAgents++;
            Stats.HibernatedAgents++;
            
            Console.WriteLine($"[SimulationEngine] Created agent {agent.Identity.Id} ({specialization})");
            
            return agent.Identity.Id;
        }
        
        public async Task<List<Tier1Agent>> WakeAgents(List<Guid> agentIds)
        {
            var agents = new List<Tier1Agent>();
            
            foreach (var agentId in agentIds)
            {
                // Check if already active
                if (_activeAgents.TryGetValue(agentId, out var activeAgent))
                {
                    agents.Add(activeAgent);
                    continue;
                }
                
                // Wake from hibernation
                if (_hibernatedAgents.TryRemove(agentId, out var snapshot))
                {
                    var agent = snapshot.Restore();
                    _activeAgents[agentId] = agent;
                    agents.Add(agent);
                    
                    Stats.HibernatedAgents--;
                    Stats.ActiveAgents++;
                    Stats.WakeupCount++;
                }
            }
            
            return agents;
        }
        
        private async Task HibernateInactiveAgents(List<Tier1Agent> agents, DateTime currentTime)
        {
            foreach (var agent in agents)
            {
                // Check if agent should stay active
                if (ShouldStayActive(agent, currentTime))
                {
                    continue;
                }
                
                // Hibernate the agent
                var snapshot = AgentSnapshot.Create(agent);
                _hibernatedAgents[agent.Identity.Id] = snapshot;
                _activeAgents.TryRemove(agent.Identity.Id, out _);
                
                Stats.ActiveAgents--;
                Stats.HibernatedAgents++;
                Stats.HibernationCount++;
            }
            
            // Enforce active agent limit
            if (_activeAgents.Count > _config.MaxActiveAgents)
            {
                await HibernateExcessAgents();
            }
        }
        
        private bool ShouldStayActive(Tier1Agent agent, DateTime currentTime)
        {
            // Keep active if next event is soon
            if (agent.NextScheduledEvent < currentTime.AddMinutes(5))
            {
                return true;
            }
            
            // Keep active if currently doing something important
            if (agent.State.CurrentActivity == Activity.Working ||
                agent.State.CurrentActivity == Activity.Learning)
            {
                return true;
            }
            
            return false;
        }
        
        private async Task HibernateExcessAgents()
        {
            var agentsToHibernate = _activeAgents.Values
                .OrderBy(a => a.NextScheduledEvent)
                .Take(_activeAgents.Count - _config.MaxActiveAgents)
                .ToList();
            
            foreach (var agent in agentsToHibernate)
            {
                var snapshot = AgentSnapshot.Create(agent);
                _hibernatedAgents[agent.Identity.Id] = snapshot;
                _activeAgents.TryRemove(agent.Identity.Id, out _);
                
                Stats.ActiveAgents--;
                Stats.HibernatedAgents++;
                Stats.HibernationCount++;
            }
        }
        
        private async Task HibernateAllActiveAgents()
        {
            foreach (var kvp in _activeAgents)
            {
                var snapshot = AgentSnapshot.Create(kvp.Value);
                _hibernatedAgents[kvp.Key] = snapshot;
            }
            
            Stats.HibernatedAgents += _activeAgents.Count;
            Stats.ActiveAgents = 0;
            _activeAgents.Clear();
        }
        
        #endregion
        
        #region Persistence
        
        public async Task SaveState(string filePath)
        {
            // Hibernate all active agents first
            await HibernateAllActiveAgents();
            
            var state = new SimulationState
            {
                Agents = _hibernatedAgents.Values.ToList(),
                Events = _eventQueue.UnorderedItems.Select(item => item.Element).ToList(),
                Statistics = Stats,
                Timestamp = DateTime.UtcNow
            };
            
            var json = JsonSerializer.Serialize(state, new JsonSerializerOptions { WriteIndented = true });
            await File.WriteAllTextAsync(filePath, json);
            
            Console.WriteLine($"[SimulationEngine] Saved state to {filePath} ({state.Agents.Count} agents)");
        }
        
        public async Task LoadState(string filePath)
        {
            if (!File.Exists(filePath))
            {
                throw new FileNotFoundException($"State file not found: {filePath}");
            }
            
            var json = await File.ReadAllTextAsync(filePath);
            var state = JsonSerializer.Deserialize<SimulationState>(json);
            
            // Clear current state
            _hibernatedAgents.Clear();
            _activeAgents.Clear();
            _eventQueue.Clear();
            
            // Load agents
            foreach (var snapshot in state.Agents)
            {
                _hibernatedAgents[snapshot.Identity.Id] = snapshot;
            }
            
            // Load events
            foreach (var evt in state.Events)
            {
                _eventQueue.Enqueue(evt, evt.ScheduledTime);
            }
            
            // Load statistics
            Stats = state.Statistics;
            Stats.HibernatedAgents = _hibernatedAgents.Count;
            Stats.ActiveAgents = 0;
            
            Console.WriteLine($"[SimulationEngine] Loaded state from {filePath} ({state.Agents.Count} agents, {state.Events.Count} events)");
        }
        
        #endregion
        
        #region Query & Observation
        
        public async Task<CitizenState> GetAgentState(Guid agentId, bool observe = false)
        {
            if (_activeAgents.TryGetValue(agentId, out var activeAgent))
            {
                return activeAgent.State;
            }
            
            if (_hibernatedAgents.TryGetValue(agentId, out var snapshot))
            {
                if (!observe)
                {
                    // Return predicted state without waking
                    return PredictState(snapshot);
                }
                else
                {
                    // Wake agent for exact state
                    var agents = await WakeAgents(new List<Guid> { agentId });
                    return agents.First().State;
                }
            }
            
            throw new KeyNotFoundException($"Agent {agentId} not found");
        }
        
        private CitizenState PredictState(AgentSnapshot snapshot)
        {
            var state = snapshot.State;
            var timePassed = DateTime.UtcNow - state.LastUpdate;
            var hours = (float)timePassed.TotalHours;
            
            // Predict state changes based on time
            return new CitizenState
            {
                CurrentActivity = state.CurrentActivity,
                LocationX = state.LocationX,
                LocationY = state.LocationY,
                Energy = Math.Max(0, state.Energy - (hours * 5)),
                Credits = state.Credits + (hours * 10),  // Assume earning
                Happiness = Math.Max(0, state.Happiness - (hours * 0.5f)),
                Health = state.Health,
                LastUpdate = DateTime.UtcNow,
                Flags = state.Flags
            };
        }
        
        public List<AgentInfo> GetAllAgents()
        {
            var agents = new List<AgentInfo>();
            
            foreach (var kvp in _hibernatedAgents)
            {
                agents.Add(new AgentInfo
                {
                    Id = kvp.Key,
                    Identity = kvp.Value.Identity,
                    State = kvp.Value.State,
                    IsActive = false,
                    NextWakeTime = kvp.Value.NextWakeTime
                });
            }
            
            foreach (var kvp in _activeAgents)
            {
                agents.Add(new AgentInfo
                {
                    Id = kvp.Key,
                    Identity = kvp.Value.Identity,
                    State = kvp.Value.State,
                    IsActive = true,
                    NextWakeTime = kvp.Value.NextScheduledEvent
                });
            }
            
            return agents;
        }
        
        #endregion
    }
    
    #region Configuration
    
    public class SimulationConfig
    {
        public int MaxActiveAgents { get; set; } = 1000;  // Limit active agents to save memory
        public TimeSpan MinEventInterval { get; set; } = TimeSpan.FromSeconds(1);
        public bool EnablePersistence { get; set; } = true;
        public string PersistencePath { get; set; } = "./simulation_state.json";
        
        public static SimulationConfig Default => new SimulationConfig();
    }
    
    #endregion
    
    #region Statistics
    
    public class SimulationStatistics
    {
        public long TotalAgents { get; set; }
        public long ActiveAgents { get; set; }
        public long HibernatedAgents { get; set; }
        public long EventsProcessed { get; set; }
        public long AgentUpdates { get; set; }
        public long WakeupCount { get; set; }
        public long HibernationCount { get; set; }
        public long ErrorCount { get; set; }
        public TimeSpan TotalProcessingTime { get; set; }
        public TimeSpan AverageEventProcessingTime { get; set; }
        
        public override string ToString()
        {
            return $"Agents: {TotalAgents} (Active: {ActiveAgents}, Hibernated: {HibernatedAgents}), " +
                   $"Events: {EventsProcessed}, Updates: {AgentUpdates}, " +
                   $"Wakeups: {WakeupCount}, Hibernations: {HibernationCount}, " +
                   $"Avg Event Time: {AverageEventProcessingTime.TotalMilliseconds:F2}ms";
        }
    }
    
    #endregion
    
    #region Supporting Classes
    
    public class AgentHibernationManager
    {
        private readonly SimulationConfig _config;
        
        public AgentHibernationManager(SimulationConfig config)
        {
            _config = config;
        }
        
        public async Task<byte[]> SerializeAgent(Tier1Agent agent)
        {
            var snapshot = AgentSnapshot.Create(agent);
            var json = JsonSerializer.Serialize(snapshot);
            return System.Text.Encoding.UTF8.GetBytes(json);
        }
        
        public async Task<Tier1Agent> DeserializeAgent(byte[] data)
        {
            var json = System.Text.Encoding.UTF8.GetString(data);
            var snapshot = JsonSerializer.Deserialize<AgentSnapshot>(json);
            return snapshot.Restore();
        }
    }
    
    public class SimulationState
    {
        public List<AgentSnapshot> Agents { get; set; }
        public List<ScheduledEvent> Events { get; set; }
        public SimulationStatistics Statistics { get; set; }
        public DateTime Timestamp { get; set; }
    }
    
    public class AgentInfo
    {
        public Guid Id { get; set; }
        public CitizenIdentity Identity { get; set; }
        public CitizenState State { get; set; }
        public bool IsActive { get; set; }
        public DateTime NextWakeTime { get; set; }
    }
    
    #endregion
}
