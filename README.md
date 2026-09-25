<div align="center">

# Agent Swarm Election Data

**Free data on who's running and where they stand. Every position backed by a quote you can check.**

[Browse the API](https://n8peace.github.io/agent-swarm-election-data/) · [How it's researched](#how-its-researched) · [Contribute research](CONTRIBUTING.md) · [Plain Ballot](https://plainballot.com)

</div>

Candidates and ballot measures for the Nov 3, 2026 U.S. election, each placed on the same 18 issues (taxes, housing, abortion, guns, immigration and more). Every position names a side of the issue, how strongly, a one-sentence summary, an exact quote and the page it came from.

**Coverage:** every race in California, plus U.S. House and Senate in all 50 states. Research updates several times a day until Election Day.

No free source did this, so a swarm of AI agents is building it in the open.

## Use the data

A free, static API, rebuilt on every change. No key, no sign-up.

```bash
# The races for one district (here, California's 10th congressional district)
curl -s https://n8peace.github.io/agent-swarm-election-data/v1/divisions/ca/cd-10.json

# Everything
curl -s https://n8peace.github.io/agent-swarm-election-data/v1/all.json
```

| Endpoint | What it returns |
|---|---|
| `/v1/index.json` | What's here, counts, license |
| `/v1/issues.json` | The 18 issues and how each side is worded |
| `/v1/all.json` | Every contest |
| `/v1/contests/{id}.json` | One contest |
| `/v1/divisions/{state}/{key}.json` | The contests for one district |
| `/schema.json` | JSON Schema for a contest |

District keys follow U.S. Census districts: `ca/state`, `ca/cd-10` (U.S. House), `ca/sldu-9` (state senate), `ca/sldl-15` (state house or assembly), `ca/county-contra-costa`, `ca/place-oakland`, `ca/school-mount-diablo-unified`. The raw files are in [data/positions](data/positions).

## How it's researched

- **Agents have to agree.** Independent agents on models from different AI companies each search and read on their own. A position is published when two of three agree and none disagree. Two more agents run when only one found something; ten run, and a majority decides, when they conflict.
- **Every quote is verified.** Each quote is fetched from its source and has to appear word for word, or it's thrown out. Every quote is rechecked nightly.
- **No guessing.** Not finding a source never counts as a vote. No agreement means the issue stays blank.
- **Never from party.** Positions come only from what a candidate said or did, never from their party, endorsements or what similar candidates believe.
- **Measures** are read from their official text: three models vote on which side a Yes vote moves each issue, and a No vote gets the opposite side.
- **Checked for bias.** Three models from different companies review every pull request for loaded wording and one-sided logic, and tests require that both sides of every issue are treated the same.
- **Corrections are public.** Anyone can report a claim; fresh agents recheck it, and the fix is published here.

The issue wording is in [lib/issues.ts](lib/issues.ts) and the agreement rules are in [lib/research/consensus.ts](lib/research/consensus.ts).

## Research with your own AI plan

The research can run on your own Claude or ChatGPT subscription, so anyone can add coverage without paying for API credits.

```bash
npm install
cp .env.example .env.local        # set RESEARCH_MODELS; add AI_GATEWAY_API_KEY for the fallback
npm run research:state -- TX      # reads the state's certified candidate list, then researches every race
```

See [CONTRIBUTING.md](CONTRIBUTING.md). There's an open "research your state" issue for each state.

## License

- **Data** ([data/](data)): [Open Database License (ODbL) 1.0](DATA-LICENSE). Use it for anything, including commercial products, as long as you credit **Agent Swarm Election Data** and share improvements to the database under the same license.
- **Code**: [AGPL-3.0](LICENSE).
- **Quotes** belong to the people and publications quoted and are included as short excerpts with their sources.

Suggested credit: *Candidate positions from Agent Swarm Election Data (github.com/n8peace/agent-swarm-election-data), ODbL.*

Research history before Sep 25, 2026 is in the [Plain Ballot repository](https://github.com/n8peace/plainballot), where this project started.
