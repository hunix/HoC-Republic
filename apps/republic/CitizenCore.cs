using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OpenClaw.Republic
{
    /// <summary>
    /// Ultra-lightweight citizen framework - Target: 100KB per Tier 1 agent
    /// </summary>
    
    #region Core Identity (20 bytes)
    
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct CitizenIdentity
    {
        public Guid Id;              // 16 bytes
        public ushort Generation;    // 2 bytes (0-65535)
        public Specialization Spec;  // 2 bytes (enum)
        
        public CitizenIdentity(Guid id, ushort generation, Specialization specialization)
        {
            Id = id;
            Generation = generation;
            Spec = specialization;
        }
    }
    
    public enum Specialization : ushort
    {
        // Science & Research
        Scientist = 0,
        Researcher = 1,
        Mathematician = 2,
        
        // Engineering
        Engineer = 10,
        Developer = 11,
        Architect = 12,
        
        // Arts & Culture
        Artist = 20,
        Writer = 21,
        Musician = 22,
        
        // Governance
        Politician = 30,
        Judge = 31,
        Diplomat = 32,
        
        // Defense
        Soldier = 40,
        CyberDefender = 41,
        Intelligence = 42,
        
        // Commerce
        Merchant = 50,
        Banker = 51,
        Trader = 52,
        
        // Education
        Teacher = 60,
        Mentor = 61,
        Librarian = 62,
        
        // Production
        Farmer = 70,
        Manufacturer = 71,
        ServiceProvider = 72,
        
        // Other
        Generalist = 100
    }
    
    #endregion
    
    #region Core State (50 bytes)
    
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct CitizenState
    {
        public Activity CurrentActivity;  // 2 bytes
        public float LocationX;           // 4 bytes
        public float LocationY;           // 4 bytes
        public float Energy;              // 4 bytes (0-100)
        public float Credits;             // 4 bytes
        public float Happiness;           // 4 bytes (0-100)
        public float Health;              // 4 bytes (0-100)
        public long LastUpdateTicks;      // 8 bytes (DateTime.Ticks)
        public ushort Flags;              // 2 bytes (bitfield)
        private fixed byte _padding[14];  // 14 bytes padding to reach 50
        
        public DateTime LastUpdate
        {
            get => new DateTime(LastUpdateTicks);
            set => LastUpdateTicks = value.Ticks;
        }
        
        public bool IsAsleep => (Flags & 0x0001) != 0;
        public bool IsWorking => (Flags & 0x0002) != 0;
        public bool IsHungry => Energy < 20;
        public bool IsUnhappy => Happiness < 30;
        public bool IsIll => Health < 50;
    }
    
    public enum Activity : ushort
    {
        Sleeping,
        Eating,
        Working,
        Socializing,
        Learning,
        Resting,
        Traveling,
        Shopping,
        Entertaining,
        Idle
    }
    
    #endregion
    
    #region Relationships (Compressed, ~2KB)
    
    public class CitizenRelationships
    {
        // Family (up to 10 members)
        public Guid[] Family { get; set; } = new Guid[10];
        public byte FamilyCount { get; set; }
        
        // Friends (up to 50)
        public Guid[] Friends { get; set; } = new Guid[50];
        public byte[] FriendshipStrength { get; set; } = new byte[50];  // 0-255
        public byte FriendCount { get; set; }
        
        // Colleagues (up to 20)
        public Guid[] Colleagues { get; set; } = new Guid[20];
        public byte ColleagueCount { get; set; }
        
        public void AddFamily(Guid memberId)
        {
            if (FamilyCount < 10)
            {
                Family[FamilyCount++] = memberId;
            }
        }
        
        public void AddFriend(Guid friendId, byte strength = 128)
        {
            if (FriendCount < 50)
            {
                Friends[FriendCount] = friendId;
                FriendshipStrength[FriendCount] = strength;
                FriendCount++;
            }
        }
        
        public void AddColleague(Guid colleagueId)
        {
            if (ColleagueCount < 20)
            {
                Colleagues[ColleagueCount++] = colleagueId;
            }
        }
        
        public int GetMemorySize()
        {
            return (10 + 50 + 20) * 16 + 50 + 3;  // GUIDs + strengths + counts = ~1.3KB
        }
    }
    
    #endregion
    
    #region Skills (Compressed, ~1KB)
    
    public class CitizenSkills
    {
        // 32 most important skills (instead of 100)
        public byte[] SkillLevels { get; set; } = new byte[32];  // 0-255
        public ushort[] ExperiencePoints { get; set; } = new ushort[32];  // 0-65535
        
        public byte GetSkillLevel(SkillType skill)
        {
            return SkillLevels[(int)skill];
        }
        
        public void AddExperience(SkillType skill, ushort points)
        {
            int index = (int)skill;
            ExperiencePoints[index] += points;
            
            // Level up every 1000 XP
            while (ExperiencePoints[index] >= 1000 && SkillLevels[index] < 255)
            {
                ExperiencePoints[index] -= 1000;
                SkillLevels[index]++;
            }
        }
        
        public int GetMemorySize()
        {
            return 32 + (32 * 2);  // 96 bytes
        }
    }
    
    public enum SkillType : byte
    {
        // Cognitive
        Logic = 0,
        Memory = 1,
        Creativity = 2,
        Learning = 3,
        
        // Social
        Communication = 10,
        Persuasion = 11,
        Empathy = 12,
        Leadership = 13,
        
        // Technical
        Programming = 20,
        Engineering = 21,
        Mathematics = 22,
        Science = 23,
        
        // Physical (simulated)
        Strength = 30,
        Dexterity = 31,
        Endurance = 32,
        
        // Professional
        Trading = 40,
        Management = 41,
        Teaching = 42,
        Healing = 43
    }
    
    #endregion
    
    #region Memory (Compressed, ~10KB)
    
    public class CitizenMemory
    {
        // Circular buffer of recent events (last 50)
        public MemoryEvent[] RecentEvents { get; set; } = new MemoryEvent[50];
        public byte RecentEventCount { get; set; }
        public byte RecentEventIndex { get; set; }
        
        // Important memories (top 20, compressed)
        public ImportantMemory[] ImportantMemories { get; set; } = new ImportantMemory[20];
        public byte ImportantMemoryCount { get; set; }
        
        public void AddEvent(MemoryEvent evt)
        {
            RecentEvents[RecentEventIndex] = evt;
            RecentEventIndex = (byte)((RecentEventIndex + 1) % 50);
            if (RecentEventCount < 50) RecentEventCount++;
            
            // Promote to important if significant
            if (evt.Importance > 200)
            {
                PromoteToImportant(evt);
            }
        }
        
        private void PromoteToImportant(MemoryEvent evt)
        {
            if (ImportantMemoryCount < 20)
            {
                ImportantMemories[ImportantMemoryCount++] = new ImportantMemory
                {
                    Timestamp = evt.Timestamp,
                    Type = evt.Type,
                    SummaryId = evt.SummaryId,
                    Importance = evt.Importance,
                    EmotionalValence = evt.EmotionalValence
                };
            }
            else
            {
                // Replace least important
                byte minIndex = 0;
                byte minImportance = 255;
                for (byte i = 0; i < 20; i++)
                {
                    if (ImportantMemories[i].Importance < minImportance)
                    {
                        minImportance = ImportantMemories[i].Importance;
                        minIndex = i;
                    }
                }
                if (evt.Importance > minImportance)
                {
                    ImportantMemories[minIndex] = new ImportantMemory
                    {
                        Timestamp = evt.Timestamp,
                        Type = evt.Type,
                        SummaryId = evt.SummaryId,
                        Importance = evt.Importance,
                        EmotionalValence = evt.EmotionalValence
                    };
                }
            }
        }
        
        public int GetMemorySize()
        {
            return (50 * 16) + (20 * 12) + 3;  // ~1KB
        }
    }
    
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct MemoryEvent
    {
        public long Timestamp;           // 8 bytes (DateTime.Ticks)
        public EventType Type;           // 2 bytes
        public ushort SummaryId;         // 2 bytes (index into string pool)
        public byte Importance;          // 1 byte (0-255)
        public sbyte EmotionalValence;   // 1 byte (-128 to 127)
        private fixed byte _padding[2];  // 2 bytes padding = 16 bytes total
    }
    
    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct ImportantMemory
    {
        public long Timestamp;          // 8 bytes
        public EventType Type;          // 2 bytes
        public ushort SummaryId;        // 2 bytes
        public byte Importance;         // 1 byte
        public sbyte EmotionalValence;  // 1 byte
        // 14 bytes total (with padding)
    }
    
    public enum EventType : ushort
    {
        Birth,
        Education,
        FirstJob,
        Marriage,
        ChildBirth,
        Promotion,
        Achievement,
        Friendship,
        Conflict,
        Loss,
        Discovery,
        Creation,
        Election,
        Award,
        Failure,
        Recovery,
        Other
    }
    
    #endregion
    
    #region Behavior Rules (State Machine, ~5KB)
    
    public class BehaviorStateMachine
    {
        private Dictionary<(Activity, Condition), Activity> Transitions;
        
        public BehaviorStateMachine()
        {
            Transitions = new Dictionary<(Activity, Condition), Activity>
            {
                // Energy management
                { (Activity.Working, Condition.LowEnergy), Activity.Eating },
                { (Activity.Socializing, Condition.LowEnergy), Activity.Resting },
                { (Activity.Learning, Condition.LowEnergy), Activity.Sleeping },
                
                // Happiness management
                { (Activity.Working, Condition.Unhappy), Activity.Socializing },
                { (Activity.Idle, Condition.Unhappy), Activity.Entertaining },
                
                // Economic needs
                { (Activity.Idle, Condition.LowCredits), Activity.Working },
                { (Activity.Resting, Condition.LowCredits), Activity.Working },
                
                // Health management
                { (Activity.Working, Condition.Ill), Activity.Resting },
                { (Activity.Socializing, Condition.Ill), Activity.Resting },
                
                // Normal flow
                { (Activity.Sleeping, Condition.FullEnergy), Activity.Working },
                { (Activity.Eating, Condition.FullEnergy), Activity.Working },
                { (Activity.Working, Condition.EndOfDay), Activity.Socializing },
                { (Activity.Socializing, Condition.Late), Activity.Sleeping },
            };
        }
        
        public Activity GetNextActivity(CitizenState state)
        {
            var condition = EvaluateCondition(state);
            var key = (state.CurrentActivity, condition);
            
            if (Transitions.TryGetValue(key, out var nextActivity))
            {
                return nextActivity;
            }
            
            return state.CurrentActivity;  // Stay in current activity
        }
        
        private Condition EvaluateCondition(CitizenState state)
        {
            if (state.Energy < 20) return Condition.LowEnergy;
            if (state.Energy > 90) return Condition.FullEnergy;
            if (state.Happiness < 30) return Condition.Unhappy;
            if (state.Health < 50) return Condition.Ill;
            if (state.Credits < 10) return Condition.LowCredits;
            
            var hour = state.LastUpdate.Hour;
            if (hour >= 17) return Condition.EndOfDay;
            if (hour >= 22) return Condition.Late;
            
            return Condition.Normal;
        }
    }
    
    public enum Condition
    {
        Normal,
        LowEnergy,
        FullEnergy,
        Unhappy,
        Ill,
        LowCredits,
        EndOfDay,
        Late
    }
    
    #endregion
    
    #region Tier 1 Agent (Reactive, ~100KB total)
    
    public class Tier1Agent
    {
        // Core components
        public CitizenIdentity Identity { get; set; }
        public CitizenState State { get; set; }
        public CitizenRelationships Relationships { get; set; }
        public CitizenSkills Skills { get; set; }
        public CitizenMemory Memory { get; set; }
        public BehaviorStateMachine Behavior { get; set; }
        
        // Lifecycle
        public DateTime NextScheduledEvent { get; set; }
        public List<ScheduledEvent> UpcomingEvents { get; set; }
        
        public Tier1Agent(Specialization specialization)
        {
            Identity = new CitizenIdentity(Guid.NewGuid(), 0, specialization);
            State = new CitizenState
            {
                CurrentActivity = Activity.Idle,
                LocationX = 0,
                LocationY = 0,
                Energy = 100,
                Credits = 100,
                Happiness = 75,
                Health = 100,
                LastUpdate = DateTime.UtcNow,
                Flags = 0
            };
            Relationships = new CitizenRelationships();
            Skills = new CitizenSkills();
            Memory = new CitizenMemory();
            Behavior = new BehaviorStateMachine();
            UpcomingEvents = new List<ScheduledEvent>();
            
            // Schedule first events
            ScheduleEvent(EventType.FirstJob, DateTime.UtcNow.AddHours(1));
        }
        
        public void ProcessTick(DateTime currentTime)
        {
            // Update state based on time passed
            var timePassed = currentTime - State.LastUpdate;
            var hours = (float)timePassed.TotalHours;
            
            // Decay energy
            State.Energy = Math.Max(0, State.Energy - (hours * 5));
            
            // Earn money if working
            if (State.IsWorking)
            {
                State.Credits += hours * GetHourlyWage();
            }
            
            // Decay happiness slowly
            State.Happiness = Math.Max(0, State.Happiness - (hours * 0.5f));
            
            // Update activity based on state machine
            State.CurrentActivity = Behavior.GetNextActivity(State);
            
            State.LastUpdate = currentTime;
        }
        
        public void ProcessEvent(ScheduledEvent evt)
        {
            switch (evt.Type)
            {
                case EventType.FirstJob:
                    State.CurrentActivity = Activity.Working;
                    Memory.AddEvent(new MemoryEvent
                    {
                        Timestamp = DateTime.UtcNow.Ticks,
                        Type = EventType.FirstJob,
                        Importance = 200,
                        EmotionalValence = 50
                    });
                    break;
                
                case EventType.Friendship:
                    State.Happiness += 10;
                    break;
                
                // ... other events
            }
        }
        
        private float GetHourlyWage()
        {
            // Base wage + skill bonuses
            float baseWage = 10.0f;
            float skillBonus = Skills.GetSkillLevel(GetPrimarySkill()) * 0.1f;
            return baseWage + skillBonus;
        }
        
        private SkillType GetPrimarySkill()
        {
            return Identity.Spec switch
            {
                Specialization.Scientist => SkillType.Science,
                Specialization.Engineer => SkillType.Engineering,
                Specialization.Developer => SkillType.Programming,
                Specialization.Teacher => SkillType.Teaching,
                Specialization.Merchant => SkillType.Trading,
                _ => SkillType.Logic
            };
        }
        
        private void ScheduleEvent(EventType type, DateTime when)
        {
            UpcomingEvents.Add(new ScheduledEvent
            {
                EventId = Guid.NewGuid(),
                Type = type,
                ScheduledTime = when,
                AffectedAgentIds = new List<Guid> { Identity.Id }
            });
            
            if (when < NextScheduledEvent || NextScheduledEvent == default)
            {
                NextScheduledEvent = when;
            }
        }
        
        public int GetMemoryFootprint()
        {
            return 20 +  // Identity
                   50 +  // State
                   Relationships.GetMemorySize() +  // ~1.3KB
                   Skills.GetMemorySize() +  // ~96 bytes
                   Memory.GetMemorySize() +  // ~1KB
                   5000 +  // Behavior state machine
                   1000;  // Upcoming events + overhead
                   // Total: ~8.5KB (well under 100KB target)
        }
    }
    
    #endregion
    
    #region Scheduled Events
    
    public class ScheduledEvent
    {
        public Guid EventId { get; set; }
        public EventType Type { get; set; }
        public DateTime ScheduledTime { get; set; }
        public List<Guid> AffectedAgentIds { get; set; }
        public Dictionary<string, object> Data { get; set; }
    }
    
    #endregion
    
    #region Serialization (for hibernation)
    
    public class AgentSnapshot
    {
        public CitizenIdentity Identity { get; set; }
        public CitizenState State { get; set; }
        public byte[] CompressedData { get; set; }  // Relationships + Skills + Memory
        public DateTime NextWakeTime { get; set; }
        
        public static AgentSnapshot Create(Tier1Agent agent)
        {
            // Serialize relationships, skills, memory
            var data = new
            {
                agent.Relationships,
                agent.Skills,
                agent.Memory,
                agent.UpcomingEvents
            };
            
            var json = JsonSerializer.Serialize(data);
            var compressed = System.IO.Compression.GZip.Compress(System.Text.Encoding.UTF8.GetBytes(json));
            
            return new AgentSnapshot
            {
                Identity = agent.Identity,
                State = agent.State,
                CompressedData = compressed,
                NextWakeTime = agent.NextScheduledEvent
            };
        }
        
        public Tier1Agent Restore()
        {
            var decompressed = System.IO.Compression.GZip.Decompress(CompressedData);
            var json = System.Text.Encoding.UTF8.GetString(decompressed);
            var data = JsonSerializer.Deserialize<dynamic>(json);
            
            return new Tier1Agent(Identity.Spec)
            {
                Identity = Identity,
                State = State,
                Relationships = data.Relationships,
                Skills = data.Skills,
                Memory = data.Memory,
                UpcomingEvents = data.UpcomingEvents,
                NextScheduledEvent = NextWakeTime
            };
        }
        
        public int GetSerializedSize()
        {
            return 20 + 50 + CompressedData.Length + 8;  // ~2-5KB compressed
        }
    }
    
    #endregion
}

// Helper extension for GZip
namespace System.IO.Compression
{
    public static class GZip
    {
        public static byte[] Compress(byte[] data)
        {
            using var output = new MemoryStream();
            using (var gzip = new GZipStream(output, CompressionMode.Compress))
            {
                gzip.Write(data, 0, data.Length);
            }
            return output.ToArray();
        }
        
        public static byte[] Decompress(byte[] data)
        {
            using var input = new MemoryStream(data);
            using var gzip = new GZipStream(input, CompressionMode.Decompress);
            using var output = new MemoryStream();
            gzip.CopyTo(output);
            return output.ToArray();
        }
    }
}
