# MOLUSCE land-cover simulation (QGIS)

- QGIS version: 3.40.15 (Bratislava)
- MOLUSCE version: 5.2.0
- Input maps: LULC 2015, 2019 and 2023 (6 classes, 0 = background)
- Spatial factors: elevation (DEM), slope, distance to built-up, distance to roads, distance to the urban centre

## Runs

| | Historical test | Projection |
|---|---|---|
| Calibration period | 2015 -> 2019 | 2019 -> 2023 |
| Simulation | one 4-year step, 2019 -> 2023 | two 4-year steps, 2023 -> 2031 |
| Compared with | observed 2023 map | (no observed map) |

## ANN (multi-layer perceptron) settings

- Neighbourhood: 1 pixel
- Hidden layer neurons: 5
- Learning rate: 0.001
- Momentum: 0.001
- Maximum training iterations: 2,000

Note: the number of simulation steps (1 or 2) is set in the simulation step of MOLUSCE and is separate from the ANN training iterations.
