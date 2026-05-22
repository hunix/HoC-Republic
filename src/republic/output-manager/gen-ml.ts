/**
 * Output Manager — ML/AI Project Generators
 */

import type { ProjectFile } from "./types.js";
import { pick, uid } from "../utils.js";
import { evolution } from "./core.js";

/** ML training pipeline â€” full project scaffold */
export function generateMLPipeline(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const tasks = [
    "image-classification",
    "text-sentiment",
    "time-series-forecast",
    "anomaly-detection",
    "recommendation-engine",
    "object-detection",
    "speech-recognition",
    "tabular-regression",
  ];
  const task = pick(tasks);
  const frameworks = ["PyTorch", "TensorFlow", "scikit-learn", "JAX", "XGBoost"];
  const framework = pick(frameworks);
  const slug = `ml-${task}-${uid().slice(0, 6)}`;
  const title = `${task} ML pipeline (${framework}) by ${creatorName}`;
  const cx = evolution.complexityLevel;
  const epochs = Math.floor(10 * cx);
  const layers = Math.floor(3 + Math.random() * 4 * cx);
  const lr = (0.001 / cx).toExponential(1);

  const config = {
    project: slug,
    task,
    framework,
    creator: creatorName,
    hyperparameters: {
      learning_rate: parseFloat(lr),
      epochs,
      batch_size: 32,
      layers,
      dropout: 0.3,
      optimizer: "adam",
    },
    data: {
      train_split: 0.8,
      val_split: 0.1,
      test_split: 0.1,
      augmentation: task.includes("image"),
    },
    complexity: cx,
    created: new Date().toISOString(),
  };

  const modelPy =
    framework === "PyTorch"
      ? `import torch\nimport torch.nn as nn\nimport torch.optim as optim\n\nclass ${task.replace(/-/g, "_").replace(/^./, (c) => c.toUpperCase())}Model(nn.Module):\n    """${task} model â€” ${layers} layers"""\n    def __init__(self, input_dim, output_dim):\n        super().__init__()\n        dims = [input_dim] + [${Array.from({ length: layers }, (_, i) => Math.floor(128 / (i + 1))).join(", ")}] + [output_dim]\n        self.layers = nn.ModuleList()\n        for i in range(len(dims) - 1):\n            self.layers.append(nn.Linear(dims[i], dims[i + 1]))\n            if i < len(dims) - 2:\n                self.layers.append(nn.ReLU())\n                self.layers.append(nn.Dropout(${config.hyperparameters.dropout}))\n\n    def forward(self, x):\n        for layer in self.layers:\n            x = layer(x)\n        return x\n\ndef create_model(input_dim=784, output_dim=10):\n    return ${task.replace(/-/g, "_").replace(/^./, (c) => c.toUpperCase())}Model(input_dim, output_dim)\n`
      : framework === "TensorFlow"
        ? `import tensorflow as tf\nfrom tensorflow.keras import layers, models\n\ndef create_model(input_shape, num_classes):\n    """${task} model â€” ${layers} layers"""\n    model = models.Sequential([\n        layers.Input(shape=input_shape),\n${Array.from({ length: layers }, (_, i) => `        layers.Dense(${Math.floor(128 / (i + 1))}, activation='relu'),\n        layers.Dropout(${config.hyperparameters.dropout}),`).join("\n")}\n        layers.Dense(num_classes, activation='softmax'),\n    ])\n    model.compile(optimizer='${config.hyperparameters.optimizer}', loss='categorical_crossentropy', metrics=['accuracy'])\n    return model\n`
        : `from sklearn.pipeline import Pipeline\nfrom sklearn.preprocessing import StandardScaler\nfrom sklearn.ensemble import GradientBoostingClassifier\n\ndef create_model():\n    """${task} pipeline â€” ${framework}"""\n    return Pipeline([\n        ('scaler', StandardScaler()),\n        ('classifier', GradientBoostingClassifier(\n            n_estimators=${epochs * 10},\n            learning_rate=${lr},\n            max_depth=${layers},\n        )),\n    ])\n`;

  const files: ProjectFile[] = [
    {
      path: "config.yaml",
      content: `# ${title}\n${Object.entries(config)
        .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
        .join("\n")}\n`,
    },
    { path: "model.py", content: modelPy },
    {
      path: "data.py",
      content: `"""Data loading and preprocessing for ${task}"""\nimport numpy as np\nfrom pathlib import Path\n\ndef load_data(data_dir='./data'):\n    """Load and split dataset"""\n    # Synthetic data generation for development\n    np.random.seed(42)\n    X = np.random.randn(1000, 784 if '${task}'.startswith('image') else 20)\n    y = np.random.randint(0, 10, 1000)\n    \n    n = len(X)\n    train_end = int(n * ${config.data.train_split})\n    val_end = int(n * ${config.data.train_split + config.data.val_split})\n    \n    return {\n        'train': (X[:train_end], y[:train_end]),\n        'val': (X[train_end:val_end], y[train_end:val_end]),\n        'test': (X[val_end:], y[val_end:]),\n    }\n\ndef preprocess(X, augment=False):\n    """Normalize and optionally augment"""\n    X = (X - X.mean(axis=0)) / (X.std(axis=0) + 1e-8)\n    return X\n`,
    },
    {
      path: "train.py",
      content: `"""Training script for ${task}"""\nimport json\nfrom pathlib import Path\nfrom model import create_model\nfrom data import load_data, preprocess\n\ndef train(config_path='config.yaml'):\n    print(f'Training ${task} model with ${framework}...')\n    data = load_data()\n    X_train, y_train = data['train']\n    X_val, y_val = data['val']\n    X_train = preprocess(X_train)\n    X_val = preprocess(X_val)\n    \n    model = create_model()\n    \n    # Training loop\n    best_metric = 0\n    history = []\n    for epoch in range(${epochs}):\n        # Simulated training step\n        loss = 1.0 / (epoch + 1)\n        metric = 1 - loss\n        history.append({'epoch': epoch, 'loss': loss, 'metric': metric})\n        if metric > best_metric:\n            best_metric = metric\n            print(f'  Epoch {epoch}: new best = {metric:.4f}')\n    \n    # Save results\n    Path('results').mkdir(exist_ok=True)\n    with open('results/history.json', 'w') as f:\n        json.dump(history, f, indent=2)\n    print(f'Training complete. Best metric: {best_metric:.4f}')\n    return model\n\nif __name__ == '__main__':\n    train()\n`,
    },
    {
      path: "evaluate.py",
      content: `"""Evaluation for ${task}"""\nfrom model import create_model\nfrom data import load_data, preprocess\n\ndef evaluate():\n    data = load_data()\n    X_test, y_test = data['test']\n    X_test = preprocess(X_test)\n    model = create_model()\n    print(f'Evaluating on {len(y_test)} test samples...')\n    # Evaluation metrics\n    print('Accuracy: 0.0000 (untrained)')\n    print('F1 Score: 0.0000')\n    print('Confusion matrix: [pending]')\n\nif __name__ == '__main__':\n    evaluate()\n`,
    },
    {
      path: "requirements.txt",
      content: `# ${slug} dependencies\nnumpy>=1.24.0\npandas>=2.0.0\nscikit-learn>=1.3.0\n${framework === "PyTorch" ? "torch>=2.0.0\ntorchvision>=0.15.0" : framework === "TensorFlow" ? "tensorflow>=2.15.0" : framework === "JAX" ? "jax>=0.4.0\njaxlib>=0.4.0\nflax>=0.7.0" : "xgboost>=2.0.0"}\nmatplotlib>=3.7.0\ntqdm>=4.65.0\n`,
    },
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${task} ML pipeline â€” by **${creatorName}**\n\n**Framework:** ${framework} | **Layers:** ${layers} | **Epochs:** ${epochs} | **LR:** ${lr}\n**Complexity:** ${cx.toFixed(1)}x\n\n## Quick Start\n\`\`\`bash\npip install -r requirements.txt\npython train.py\npython evaluate.py\n\`\`\`\n`,
    },
  ];
  return { slug, files, title };
}

/** LLM fine-tuning project â€” full scaffold */
export function generateLLMProject(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const tasks = [
    "chat-assistant",
    "code-completion",
    "summarization",
    "translation",
    "classification",
    "entity-extraction",
    "question-answering",
    "creative-writing",
  ];
  const task = pick(tasks);
  const bases = ["Llama-3-8B", "Mistral-7B", "Phi-3-mini", "Gemma-2B", "Qwen2-7B", "CodeLlama-7B"];
  const base = pick(bases);
  const methods = ["LoRA", "QLoRA", "full-finetune", "prefix-tuning", "adapter"];
  const method = pick(methods);
  const slug = `llm-${task}-${uid().slice(0, 6)}`;
  const title = `${task} LLM fine-tune (${base} + ${method}) by ${creatorName}`;
  const cx = evolution.complexityLevel;
  const samples = Math.floor(500 * cx);

  const dataset: { instruction: string; input: string; output: string }[] = [];
  const templates = {
    "chat-assistant": () => ({
      instruction: "You are a helpful assistant.",
      input: pick([
        "What is ML?",
        "Explain transformers",
        "How does backprop work?",
        "What is attention?",
      ]),
      output: pick([
        "ML is a subset of AI...",
        "Transformers use self-attention...",
        "Backpropagation computes gradients...",
        "Attention weighs input relevance...",
      ]),
    }),
    "code-completion": () => ({
      instruction: "Complete the code",
      input: `def ${pick(["sort", "search", "filter", "transform"])}(data):`,
      output: `    return ${pick(["sorted(data)", "[x for x in data if x > 0]", "list(map(str, data))", "data[::-1]"])}`,
    }),
    summarization: () => ({
      instruction: "Summarize the text",
      input: "The Republic platform enables autonomous digital citizens...",
      output: "An autonomous digital civilization simulation.",
    }),
  } as Record<string, () => { instruction: string; input: string; output: string }>;
  const gen = templates[task] ?? templates["chat-assistant"];
  for (let i = 0; i < Math.min(samples, 20); i++) {
    dataset.push(gen());
  }

  const files: ProjectFile[] = [
    {
      path: "config.yaml",
      content: `# ${title}\nbase_model: ${base}\nmethod: ${method}\ntask: ${task}\nsamples: ${samples}\nhyperparameters:\n  lora_r: 16\n  lora_alpha: 32\n  lora_dropout: 0.05\n  learning_rate: 2e-5\n  epochs: ${Math.floor(3 * cx)}\n  batch_size: 4\n  gradient_accumulation: 4\n  warmup_ratio: 0.1\n  max_seq_length: 2048\n  quantization: ${method === "QLoRA" ? "4bit" : "none"}\ncreator: ${creatorName}\ncomplexity: ${cx.toFixed(1)}\n`,
    },
    { path: "dataset.jsonl", content: dataset.map((d) => JSON.stringify(d)).join("\n") + "\n" },
    {
      path: "finetune.py",
      content: `"""Fine-tune ${base} for ${task} using ${method}"""\nimport json\nfrom pathlib import Path\n\ndef load_dataset(path='dataset.jsonl'):\n    with open(path) as f:\n        return [json.loads(line) for line in f]\n\ndef finetune():\n    print(f'Fine-tuning ${base} for ${task} using ${method}...')\n    data = load_dataset()\n    print(f'  Dataset: {len(data)} samples')\n    print(f'  Method: ${method}')\n    print(f'  Config: lr=2e-5, epochs=${Math.floor(3 * cx)}, batch=4')\n    \n    # Simulated training\n    for epoch in range(${Math.floor(3 * cx)}):\n        loss = 2.0 / (epoch + 1)\n        print(f'  Epoch {epoch + 1}: loss={loss:.4f}')\n    \n    Path('output').mkdir(exist_ok=True)\n    print(f'Model saved to ./output/${slug}-merged')\n\nif __name__ == '__main__':\n    finetune()\n`,
    },
    {
      path: "evaluate.py",
      content: `"""Evaluate fine-tuned ${base} model"""\nimport json\n\ndef evaluate(model_path='./output/${slug}-merged'):\n    print(f'Evaluating {model_path}...')\n    # Standard LLM eval metrics\n    metrics = {\n        'perplexity': 12.5,\n        'bleu': 0.42,\n        'rouge_l': 0.68,\n        'exact_match': 0.55,\n        'task_accuracy': 0.72,\n    }\n    for k, v in metrics.items():\n        print(f'  {k}: {v}')\n    with open('output/eval_results.json', 'w') as f:\n        json.dump(metrics, f, indent=2)\n\nif __name__ == '__main__':\n    evaluate()\n`,
    },
    {
      path: "inference.py",
      content: `"""Inference server for ${task} model"""\n\ndef generate(prompt, max_tokens=256):\n    """Generate response from fine-tuned model"""\n    print(f'Generating for: {prompt[:50]}...')\n    return f'[Generated response for: {prompt}]'\n\ndef serve(host='0.0.0.0', port=8000):\n    """Start inference server"""\n    print(f'Starting ${task} inference server on {host}:{port}')\n    print(f'Model: ${base} + ${method}')\n    # FastAPI/vLLM server would go here\n\nif __name__ == '__main__':\n    serve()\n`,
    },
    {
      path: "requirements.txt",
      content: `# ${slug}\ntransformers>=4.38.0\npeft>=0.8.0\ntrl>=0.7.0\ndatasets>=2.16.0\nbitsandbytes>=0.42.0\naccelerate>=0.27.0\ntorch>=2.0.0\nwandb>=0.16.0\n`,
    },
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${task} LLM fine-tune â€” by **${creatorName}**\n\n**Base:** ${base} | **Method:** ${method} | **Samples:** ${samples}\n**Complexity:** ${cx.toFixed(1)}x\n\n## Usage\n\`\`\`bash\npip install -r requirements.txt\npython finetune.py      # Train\npython evaluate.py      # Eval\npython inference.py     # Serve\n\`\`\`\n`,
    },
  ];
  return { slug, files, title };
}

/** Synthetic dataset scaffold */
export function generateDataset(creatorName: string): {
  slug: string;
  files: ProjectFile[];
  title: string;
} {
  const domains = [
    "healthcare",
    "finance",
    "e-commerce",
    "social-media",
    "IoT-sensors",
    "cybersecurity",
    "NLP-corpus",
    "computer-vision",
  ];
  const domain = pick(domains);
  const formats = ["tabular", "time-series", "text-corpus", "image-labels", "graph", "sequence"];
  const format = pick(formats);
  const slug = `dataset-${domain}-${uid().slice(0, 6)}`;
  const title = `${domain} ${format} dataset by ${creatorName}`;
  const cx = evolution.complexityLevel;
  const rows = Math.floor(1000 * cx);
  const features = Math.floor(8 + Math.random() * 12 * cx);

  // Generate schema
  const featureTypes = ["float64", "int64", "string", "bool", "datetime", "category"];
  const schema = {
    name: slug,
    domain,
    format,
    creator: creatorName,
    rows,
    features,
    columns: Array.from({ length: features }, (_, i) => ({
      name: `feature_${i}`,
      type: pick(featureTypes),
      nullable: Math.random() > 0.7,
      description: `${pick(["Normalized", "Raw", "Encoded", "Aggregated"])} ${pick(["metric", "indicator", "signal", "measurement"])} ${i}`,
    })),
    target: { name: "label", type: "category", classes: Math.floor(2 + Math.random() * 8) },
    created: new Date().toISOString(),
  };

  // Generate CSV header + sample rows
  const header = schema.columns.map((c) => c.name).join(",") + ",label";
  const sampleRows = Array.from(
    { length: Math.min(20, rows) },
    () =>
      schema.columns
        .map((c) => {
          if (c.type === "float64") {
            return (Math.random() * 100).toFixed(3);
          }
          if (c.type === "int64") {
            return Math.floor(Math.random() * 1000).toString();
          }
          if (c.type === "bool") {
            return Math.random() > 0.5 ? "true" : "false";
          }
          if (c.type === "category") {
            return pick(["A", "B", "C", "D"]);
          }
          return `"val_${Math.floor(Math.random() * 100)}"`;
        })
        .join(",") +
      "," +
      Math.floor(Math.random() * schema.target.classes),
  );
  const csv = header + "\n" + sampleRows.join("\n") + "\n";

  const files: ProjectFile[] = [
    { path: "schema.json", content: JSON.stringify(schema, null, 2) },
    { path: "data.csv", content: csv },
    {
      path: "analysis.py",
      content: `"""Dataset analysis for ${domain} ${format}"""\nimport json\nfrom pathlib import Path\n\ndef analyze(data_path='data.csv'):\n    with open('schema.json') as f:\n        schema = json.load(f)\n    \n    print(f'Dataset: {schema["name"]}')\n    print(f'Domain: {schema["domain"]}')\n    print(f'Rows: {schema["rows"]} | Features: {schema["features"]}')\n    print(f'Target classes: {schema["target"]["classes"]}')\n    print('\\nColumn types:')\n    for col in schema['columns']:\n        print(f'  {col["name"]}: {col["type"]} ({"nullable" if col["nullable"] else "required"})')\n    \n    # Basic stats from CSV\n    lines = Path(data_path).read_text().strip().split('\\n')\n    print(f'\\nSample rows loaded: {len(lines) - 1}')\n\nif __name__ == '__main__':\n    analyze()\n`,
    },
    {
      path: "loader.py",
      content: `"""Data loader for ${domain} dataset"""\nimport csv\nfrom pathlib import Path\n\ndef load(path='data.csv', split_ratio=0.8):\n    """Load and split dataset"""\n    with open(path) as f:\n        reader = csv.DictReader(f)\n        rows = list(reader)\n    \n    n = len(rows)\n    split = int(n * split_ratio)\n    return {\n        'train': rows[:split],\n        'test': rows[split:],\n        'columns': list(rows[0].keys()) if rows else [],\n        'total': n,\n    }\n\nif __name__ == '__main__':\n    data = load()\n    print(f'Train: {len(data["train"])} | Test: {len(data["test"])}')\n`,
    },
    {
      path: "README.md",
      content: `# ${slug}\n\n> ${domain} ${format} dataset â€” by **${creatorName}**\n\n**Rows:** ${rows} | **Features:** ${features} | **Target classes:** ${schema.target.classes}\n**Complexity:** ${cx.toFixed(1)}x\n\n## Usage\n\`\`\`python\nfrom loader import load\ndata = load('data.csv')\nprint(f'Train: {len(data["train"])} samples')\n\`\`\`\n`,
    },
  ];
  return { slug, files, title };
}
