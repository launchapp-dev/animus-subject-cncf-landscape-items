# animus-subject-cncf-landscape-items

CNCF Landscape items subject backend plugin for Animus.

This plugin reads the official CNCF Landscape `landscape.yml` file and exposes cloud-native projects, products, and tools as `cncf.landscape_item` subjects. Subjects include category, subcategory, CNCF project maturity, homepage and repository URLs, logo metadata, LFX and CLOMonitor identifiers, DevStats links, annual review metadata, and other extra landscape fields.

## Install

```sh
animus plugin install launchapp-dev/animus-subject-cncf-landscape-items
```

## Use

```sh
animus subject list --kind cncf.landscape_item --limit 5 --json
```

```sh
animus subject get --kind cncf.landscape_item --id cncf.landscape_item:provisioning/automation-and-configuration/akri --json
```

## Configuration

- `CNCF_LANDSCAPE_URL`: optional CNCF `landscape.yml` URL. Defaults to `https://raw.githubusercontent.com/cncf/landscape/master/landscape.yml`.
- `CNCF_QUERY`: optional local text query across item names, descriptions, paths, project maturity, URLs, and metadata.
- `CNCF_CATEGORY`: optional category or subcategory text filter.
- `CNCF_PROJECT`: optional CNCF project maturity filter, such as `sandbox`, `incubating`, `graduated`, or `none`.
- `CNCF_LIMIT`: optional maximum item count from 1 to 1000. Defaults to 100.

## Source

- CNCF Landscape: https://landscape.cncf.io/
- CNCF Landscape repository: https://github.com/cncf/landscape
- CNCF landscape.yml data: https://raw.githubusercontent.com/cncf/landscape/master/landscape.yml
