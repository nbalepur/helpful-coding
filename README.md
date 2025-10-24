# The RealHumanEval

Associated code, data and interface for the paper "The Real HumanEval: Evaluating Large Language Models’ Abilities to Support Programmers”.


The interface in [interface](interface) also includes code from our follow-up work "Need Help? Designing Proactive AI Assistants for Programming" by
Valerie Chen, Alan Zhu, Sebastian Zhao, Hussein Mozannar, David Sontag, Ameet Talwalkar.

Quick Links:


- **Data**: [HF Datasets link](https://huggingface.co/datasets/hsseinmz/realhumaneval) and local link [data](data/README.md). All dataset documentation, Croissant metadata record, hosting, licensing, and maintenance plan are provided in the HF link.

- **Interface Code**:  [interface](interface/README.md) - local version

- **Analysis Code**:  [analysis](analysis/README.md)

- **Paper**: [arxiv link](https://arxiv.org/abs/2404.02806)

<img src="./static/fig1.png" alt="Overview of RealHumanEval" width="75%"/>


# What is it?


This repository introduces an interface for evaluating humans writing code with large language models (LLMs) "RealHumanEval". Users can interact with LLMs integrated into an editor through either autocomplete support, akin to GitHub Copilot, or chat support, akin to ChatGPT.


Using this interface, we ran  a user study (N=243) to measure the ability of different LLMs to support programmers in their tasks. 
We measure user performance in terms of the speed and amount of tasks completed, as well as user satisfaction metrics of LLM helpfulness.
While we find general correspondence between benchmark performance and user performance (i.e., less performant models tended to slow users down and reduce the number of tasks completed), the gaps in benchmark performance are not proportional to gaps in human performance metrics.

In this repository, you can find the data of participants study sessions as well as code to analyze that data and the code for RealHumanEval.



# Data

You can find our data on Huggingface hub at [realhumaneval](https://huggingface.co/datasets/hsseinmz/realhumaneval), or for a direct download link you can find in [./data](./data).


The data released consists of four parts (can also be found in the folder [./data](./data)):

- chat (chat_data.csv): contains the chat logs of the conversations between the study participants and the LLMs

- autocomplete (autocomplete_data.csv): for each suggestion shown in the autocomplete conditions, we log whether it was accepted and the prompt of the LLM

- tasks (task_data.csv): the tasks that the participants were asked to complete

- study (study_data.csv and study_data.pkl): a dataframe of processed information for each participant (e.g., how many tasks they completed, their code history, how many suggestions they accepted ...). Use the pickle version of this file for the most accurate representation of the data.


# Quick Start

## 🚀 Running the Application

The easiest way to get started is using the provided scripts:

### First Time Setup
```bash
# 1. Run setup script
./scripts/setup.sh

# 2. Configure environment (optional - defaults work for local dev)
cd backend
cp env.example .env
# Edit .env with your settings if needed

# 3. Sync environment to frontend
cd ../interface
npm run sync-env
```

### Start the Application
```bash
# Start both frontend and backend (auto-syncs environment)
./scripts/start-all.sh

# Or start individually:
./scripts/start-backend.sh   # Backend only
./scripts/start-frontend.sh  # Frontend only
```

### URLs
- **Frontend**: http://localhost:3000
- **Backend**: http://localhost:8000
- **Health Check**: http://localhost:8000/health

For detailed setup instructions, see [scripts/README.md](scripts/README.md).

## 🔧 Environment Configuration

The application uses environment variables for configuration. All variables are defined in `backend/.env` (single source of truth) and automatically synced to the frontend.

**Quick Setup:**
1. Copy `backend/env.example` to `backend/.env`
2. Run `npm run sync-env` from the `interface/` directory
3. Restart servers

See [ENV_SETUP.md](ENV_SETUP.md) for detailed configuration options.

# Installation

## For Development

The application consists of two parts:
- **Backend**: Python FastAPI server (see [backend/README.md](backend/README.md))
- **Frontend**: Next.js React application (see [interface/README.md](interface/README.md))

## For Analysis

Analysis code is in Python, you will need the following packages: pandas, numpy, matplotlib, seaborn, sklearn, statsmodels, datasets (huggingface).

# Organization

This repository is organized as follows:


- [analysis](analysis) should contain the final analysis notebooks

- [data](data) should contain the raw data used for analysis

- [interface](interface) 


# Paper Reproducibility 

To reproduce figures and results from the paper, you can run the following notebooks:

- Main paper analyses  [./analysis/main_analysis.ipynb](./analysis/main_analysis.ipynb)

- Appendix analyses  [./analysis/appendix_analysis.ipynb](./analysis/appendix_analysis.ipynb)

# Citation

```
@misc{mozannar2024realhumaneval,
      title={The RealHumanEval: Evaluating Large Language Models' Abilities to Support Programmers}, 
      author={Hussein Mozannar and Valerie Chen and Mohammed Alsobay and Subhro Das and Sebastian Zhao and Dennis Wei and Manish Nagireddy and Prasanna Sattigeri and Ameet Talwalkar and David Sontag},
      year={2024},
      eprint={2404.02806},
      archivePrefix={arXiv},
      primaryClass={cs.SE}
}
@misc{chen2024needhelpdesigningproactive,
      title={Need Help? Designing Proactive AI Assistants for Programming}, 
      author={Valerie Chen and Alan Zhu and Sebastian Zhao and Hussein Mozannar and David Sontag and Ameet Talwalkar},
      year={2024},
      eprint={2410.04596},
      archivePrefix={arXiv},
      primaryClass={cs.HC},
      url={https://arxiv.org/abs/2410.04596}, 
}
```

License information is available [here](LICENSE)

# Acknowledgements

This work is partially funded by the MIT-IBM Watson AI Lab.


