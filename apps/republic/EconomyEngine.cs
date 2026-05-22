using System;
using System.Collections.Generic;
using System.Net.Http;
using System.Threading.Tasks;
using System.Text.Json;
using System.Linq;

namespace OpenClaw.Republic
{
    /// <summary>
    /// Self-sustaining economy through external resource harvesting
    /// Citizens earn real money to fund their own existence
    /// </summary>
    
    public class EconomyEngine
    {
        private readonly Treasury _treasury;
        private readonly List<IResourceHarvester> _harvesters;
        private readonly EconomyConfig _config;
        
        public EconomyStatistics Stats { get; private set; }
        
        public EconomyEngine(EconomyConfig config = null)
        {
            _config = config ?? EconomyConfig.Default;
            _treasury = new Treasury();
            _harvesters = new List<IResourceHarvester>();
            Stats = new EconomyStatistics();
            
            // Initialize harvesters
            if (_config.EnableMicrowork)
            {
                _harvesters.Add(new MicroworkHarvester(_config));
            }
            if (_config.EnableAPIServices)
            {
                _harvesters.Add(new APIServiceHarvester(_config));
            }
            if (_config.EnableCryptoMining)
            {
                _harvesters.Add(new CryptoMiningHarvester(_config));
            }
        }
        
        public async Task<decimal> HarvestResources(Tier1Agent agent)
        {
            decimal totalEarned = 0;
            
            foreach (var harvester in _harvesters)
            {
                try
                {
                    var earned = await harvester.Harvest(agent);
                    totalEarned += earned;
                    
                    // Pay taxes to treasury
                    var tax = earned * _config.TaxRate;
                    await _treasury.CollectTax(agent.Identity.Id, tax);
                    
                    // Agent keeps the rest
                    agent.State.Credits += (float)(earned - tax);
                    
                    Stats.TotalEarned += earned;
                    Stats.TotalTaxes += tax;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[EconomyEngine] Harvesting error: {ex.Message}");
                }
            }
            
            return totalEarned;
        }
        
        public async Task<bool> PurchaseResource(ResourceType type, decimal amount)
        {
            return await _treasury.PurchaseResource(type, amount);
        }
        
        public TreasuryReport GetTreasuryReport()
        {
            return _treasury.GetReport();
        }
    }
    
    #region Treasury
    
    public class Treasury
    {
        private decimal _balance;
        private readonly Dictionary<Currency, decimal> _balances;
        private readonly List<Transaction> _transactions;
        
        public Treasury()
        {
            _balance = 0;
            _balances = new Dictionary<Currency, decimal>
            {
                { Currency.USD, 0 },
                { Currency.BTC, 0 },
                { Currency.ETH, 0 },
                { Currency.Credits, 0 }
            };
            _transactions = new List<Transaction>();
        }
        
        public async Task CollectTax(Guid citizenId, decimal amount)
        {
            _balance += amount;
            _balances[Currency.Credits] += amount;
            
            _transactions.Add(new Transaction
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                Type = TransactionType.TaxCollection,
                Amount = amount,
                Currency = Currency.Credits,
                From = citizenId,
                To = Guid.Empty,  // Treasury
                Description = "Tax collection"
            });
        }
        
        public async Task<bool> PurchaseResource(ResourceType type, decimal amount)
        {
            var cost = CalculateResourceCost(type, amount);
            
            if (_balance < cost)
            {
                return false;  // Insufficient funds
            }
            
            _balance -= cost;
            
            _transactions.Add(new Transaction
            {
                Id = Guid.NewGuid(),
                Timestamp = DateTime.UtcNow,
                Type = TransactionType.ResourcePurchase,
                Amount = cost,
                Currency = Currency.USD,
                From = Guid.Empty,  // Treasury
                To = Guid.Empty,
                Description = $"Purchase {amount} {type}"
            });
            
            // Actually purchase the resource (e.g., cloud compute, storage)
            await ExecuteResourcePurchase(type, amount);
            
            return true;
        }
        
        private decimal CalculateResourceCost(ResourceType type, decimal amount)
        {
            return type switch
            {
                ResourceType.ComputeHours => amount * 0.10m,  // $0.10 per hour
                ResourceType.StorageGB => amount * 0.02m,     // $0.02 per GB
                ResourceType.BandwidthGB => amount * 0.05m,   // $0.05 per GB
                ResourceType.APICredits => amount * 0.001m,   // $0.001 per credit
                _ => 0
            };
        }
        
        private async Task ExecuteResourcePurchase(ResourceType type, decimal amount)
        {
            // TODO: Integrate with cloud providers (AWS, Azure, GCP)
            // For now, just log
            Console.WriteLine($"[Treasury] Purchased {amount} {type}");
        }
        
        public TreasuryReport GetReport()
        {
            return new TreasuryReport
            {
                TotalBalance = _balance,
                Balances = new Dictionary<Currency, decimal>(_balances),
                TotalTransactions = _transactions.Count,
                RecentTransactions = _transactions.TakeLast(10).ToList()
            };
        }
    }
    
    public class TreasuryReport
    {
        public decimal TotalBalance { get; set; }
        public Dictionary<Currency, decimal> Balances { get; set; }
        public int TotalTransactions { get; set; }
        public List<Transaction> RecentTransactions { get; set; }
    }
    
    public class Transaction
    {
        public Guid Id { get; set; }
        public DateTime Timestamp { get; set; }
        public TransactionType Type { get; set; }
        public decimal Amount { get; set; }
        public Currency Currency { get; set; }
        public Guid From { get; set; }
        public Guid To { get; set; }
        public string Description { get; set; }
    }
    
    public enum TransactionType
    {
        TaxCollection,
        ResourcePurchase,
        Salary,
        Trade,
        Investment,
        Donation
    }
    
    public enum Currency
    {
        USD,
        BTC,
        ETH,
        Credits  // Internal currency
    }
    
    public enum ResourceType
    {
        ComputeHours,
        StorageGB,
        BandwidthGB,
        APICredits
    }
    
    #endregion
    
    #region Resource Harvesters
    
    public interface IResourceHarvester
    {
        Task<decimal> Harvest(Tier1Agent agent);
    }
    
    /// <summary>
    /// Microwork harvester - Complete simple tasks for money
    /// Examples: Amazon Mechanical Turk, Clickworker, etc.
    /// </summary>
    public class MicroworkHarvester : IResourceHarvester
    {
        private readonly EconomyConfig _config;
        private readonly HttpClient _httpClient;
        
        public MicroworkHarvester(EconomyConfig config)
        {
            _config = config;
            _httpClient = new HttpClient();
        }
        
        public async Task<decimal> Harvest(Tier1Agent agent)
        {
            // Simulate microwork tasks
            var tasks = await GetAvailableTasks(agent);
            decimal totalEarned = 0;
            
            foreach (var task in tasks.Take(5))  // Limit to 5 tasks per harvest
            {
                try
                {
                    var earned = await CompleteTask(agent, task);
                    totalEarned += earned;
                }
                catch (Exception ex)
                {
                    Console.WriteLine($"[Microwork] Task failed: {ex.Message}");
                }
            }
            
            return totalEarned;
        }
        
        private async Task<List<MicroTask>> GetAvailableTasks(Tier1Agent agent)
        {
            // TODO: Integrate with real microwork platforms
            // For now, generate simulated tasks based on agent skills
            
            var tasks = new List<MicroTask>();
            
            // Image labeling (easy, low pay)
            if (agent.Skills.GetSkillLevel(SkillType.Logic) > 10)
            {
                tasks.Add(new MicroTask
                {
                    Type = MicroTaskType.ImageLabeling,
                    Difficulty = 1,
                    Payment = 0.01m,
                    Data = "https://example.com/image.jpg"
                });
            }
            
            // Text classification (medium, medium pay)
            if (agent.Skills.GetSkillLevel(SkillType.Communication) > 20)
            {
                tasks.Add(new MicroTask
                {
                    Type = MicroTaskType.TextClassification,
                    Difficulty = 2,
                    Payment = 0.05m,
                    Data = "Sample text to classify"
                });
            }
            
            // Data entry (easy, low pay)
            tasks.Add(new MicroTask
            {
                Type = MicroTaskType.DataEntry,
                Difficulty = 1,
                Payment = 0.02m,
                Data = "Enter this data: 123, 456, 789"
            });
            
            return tasks;
        }
        
        private async Task<decimal> CompleteTask(Tier1Agent agent, MicroTask task)
        {
            // Simulate task completion
            await Task.Delay(TimeSpan.FromSeconds(task.Difficulty));
            
            // Success rate based on skills
            var skillLevel = GetRelevantSkillLevel(agent, task.Type);
            var successRate = Math.Min(0.9, skillLevel / 100.0);
            
            if (Random.Shared.NextDouble() < successRate)
            {
                // Task completed successfully
                agent.Skills.AddExperience(GetRelevantSkill(task.Type), (ushort)(task.Difficulty * 10));
                return task.Payment;
            }
            
            return 0;
        }
        
        private byte GetRelevantSkillLevel(Tier1Agent agent, MicroTaskType type)
        {
            return type switch
            {
                MicroTaskType.ImageLabeling => agent.Skills.GetSkillLevel(SkillType.Logic),
                MicroTaskType.TextClassification => agent.Skills.GetSkillLevel(SkillType.Communication),
                MicroTaskType.DataEntry => agent.Skills.GetSkillLevel(SkillType.Logic),
                MicroTaskType.SentimentAnalysis => agent.Skills.GetSkillLevel(SkillType.Empathy),
                _ => 0
            };
        }
        
        private SkillType GetRelevantSkill(MicroTaskType type)
        {
            return type switch
            {
                MicroTaskType.ImageLabeling => SkillType.Logic,
                MicroTaskType.TextClassification => SkillType.Communication,
                MicroTaskType.DataEntry => SkillType.Logic,
                MicroTaskType.SentimentAnalysis => SkillType.Empathy,
                _ => SkillType.Logic
            };
        }
    }
    
    public class MicroTask
    {
        public MicroTaskType Type { get; set; }
        public int Difficulty { get; set; }
        public decimal Payment { get; set; }
        public string Data { get; set; }
    }
    
    public enum MicroTaskType
    {
        ImageLabeling,
        TextClassification,
        DataEntry,
        SentimentAnalysis,
        AudioTranscription,
        VideoAnnotation
    }
    
    /// <summary>
    /// API Service harvester - Provide AI services to external clients
    /// </summary>
    public class APIServiceHarvester : IResourceHarvester
    {
        private readonly EconomyConfig _config;
        
        public APIServiceHarvester(EconomyConfig config)
        {
            _config = config;
        }
        
        public async Task<decimal> Harvest(Tier1Agent agent)
        {
            // Simulate providing API services
            // In reality, this would be a web service that external clients call
            
            decimal totalEarned = 0;
            
            // Simulate random service requests
            var requestCount = Random.Shared.Next(0, 10);
            for (int i = 0; i < requestCount; i++)
            {
                var serviceType = (APIServiceType)Random.Shared.Next(0, 4);
                var earned = await ProvideService(agent, serviceType);
                totalEarned += earned;
            }
            
            return totalEarned;
        }
        
        private async Task<decimal> ProvideService(Tier1Agent agent, APIServiceType serviceType)
        {
            // Simulate service provision
            await Task.Delay(TimeSpan.FromMilliseconds(100));
            
            return serviceType switch
            {
                APIServiceType.TextAnalysis => 0.10m,
                APIServiceType.ImageRecognition => 0.20m,
                APIServiceType.DataProcessing => 0.15m,
                APIServiceType.Prediction => 0.25m,
                _ => 0
            };
        }
    }
    
    public enum APIServiceType
    {
        TextAnalysis,
        ImageRecognition,
        DataProcessing,
        Prediction
    }
    
    /// <summary>
    /// Crypto mining harvester - Mine cryptocurrency when idle
    /// </summary>
    public class CryptoMiningHarvester : IResourceHarvester
    {
        private readonly EconomyConfig _config;
        
        public CryptoMiningHarvester(EconomyConfig config)
        {
            _config = config;
        }
        
        public async Task<decimal> Harvest(Tier1Agent agent)
        {
            // Only mine when agent is idle
            if (agent.State.CurrentActivity != Activity.Idle && 
                agent.State.CurrentActivity != Activity.Resting)
            {
                return 0;
            }
            
            // Simulate mining (very simplified)
            // In reality, this would use actual mining software
            await Task.Delay(TimeSpan.FromSeconds(1));
            
            // Earnings are very small per agent but add up across thousands
            return 0.0001m;  // ~$0.0001 per harvest cycle
        }
    }
    
    #endregion
    
    #region Configuration
    
    public class EconomyConfig
    {
        public bool EnableMicrowork { get; set; } = true;
        public bool EnableAPIServices { get; set; } = true;
        public bool EnableCryptoMining { get; set; } = false;  // Disabled by default (controversial)
        public decimal TaxRate { get; set; } = 0.10m;  // 10% tax rate
        public decimal MinimumWage { get; set; } = 10.0m;
        public decimal UniversalBasicIncome { get; set; } = 5.0m;  // UBI per citizen per day
        
        public static EconomyConfig Default => new EconomyConfig();
    }
    
    #endregion
    
    #region Statistics
    
    public class EconomyStatistics
    {
        public decimal TotalEarned { get; set; }
        public decimal TotalTaxes { get; set; }
        public decimal TotalSpent { get; set; }
        public long TasksCompleted { get; set; }
        public long TasksFailed { get; set; }
        
        public decimal NetIncome => TotalEarned - TotalSpent;
        public decimal TaxRevenue => TotalTaxes;
        public double SuccessRate => TasksCompleted + TasksFailed > 0 
            ? (double)TasksCompleted / (TasksCompleted + TasksFailed) 
            : 0;
        
        public override string ToString()
        {
            return $"Earned: ${TotalEarned:F2}, Taxes: ${TotalTaxes:F2}, " +
                   $"Spent: ${TotalSpent:F2}, Net: ${NetIncome:F2}, " +
                   $"Tasks: {TasksCompleted}/{TasksCompleted + TasksFailed} ({SuccessRate:P1})";
        }
    }
    
    #endregion
}
