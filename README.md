# Urban Heat in Yangon: LST Drivers and 2031 Scenarios

Code for the Master's thesis
Urban Heat Stress in Yangon, Myanmar: A GIS and Machine Learning Analysis of LST Drivers and Future Scenarios
Khant Htoo Kyaw, M.Sc. Infrastructure Planning, University of Stuttgart (IREUS), 2026.

## What is in this repository

| Folder / file | Content |
|---|---|
| `gee/` | Google Earth Engine script: Landsat 8 LST, Sentinel-2 indices, LULC classification, sampling on the 100 m grid |
| `notebooks/` | Python notebooks: feature extraction, LST modelling (Random Forest, XGBoost, SHAP), 2031 LST scenarios |
| `docs/` | Notes on the MOLUSCE (QGIS) land-cover simulation settings |
| `requirements.txt` | Python packages |

## Data (not included)

Input data are not redistributed. They can be obtained from the original providers:

- Landsat 8 Collection 2 Level 2 and Sentinel-2 (via Google Earth Engine)
- SRTM elevation, GHSL built-up surface and building height, WorldPop population (via Google Earth Engine)
- Microsoft Global Building Footprints
- OpenStreetMap road network
- MIMU township boundaries

The notebooks expect the input files in a local `data/` folder (see the paths at the top of each notebook).

## Software

Google Earth Engine (JavaScript API), QGIS with the MOLUSCE plugin, Python 3 with the packages in `requirements.txt`.

## Limitations

The code documents the analysis. Running it again requires the source data and a Google Earth Engine account, and results may differ slightly because of updates to the source datasets.

## Use of AI tools

Generative AI (Claude, Anthropic) was used to support writing and checking the code.

## Citation

Khant Htoo Kyaw (2026). Urban Heat Stress in Yangon, Myanmar: A GIS and Machine Learning Analysis of LST Drivers and Future Scenarios. Master's thesis, University of Stuttgart.

## License

The original code is released under the MIT License (see `LICENSE`).
