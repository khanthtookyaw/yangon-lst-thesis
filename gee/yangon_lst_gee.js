// ============================================================
// SCRIPT 01: STUDY AREA DEFINITION
// Yangon Urban Heat Stress Thesis
// ============================================================

// ── STEP 1: Load all Myanmar townships ──────────────────────
// Replace the path below with YOUR actual asset path
// (the one you copied in Step 4 above)

var all_townships = ee.FeatureCollection(
  "projects/gen-lang-client-0287293320/assets/township"
);

// Check what columns (properties) exist in your shapefile:
print("Township columns:", all_townships.first().propertyNames());
// Look at the Console — it shows column names like:
// ["TS_NAME", "DT_NAME", "ST_NAME", "Shape_Area", ...]

// ── STEP 2: Filter to Yangon Region townships only ──────────
// The column name depends on your shapefile
// Common column names in MIMU data: "ST_NAME" or "STATE_NAME"

var yangon_region = all_townships.filter(
  ee.Filter.eq("ST", "Yangon")  // adjust column name if needed
);

print("Yangon Region township count:", yangon_region.size());
// Should print: 45 (all Yangon Region townships)

// ── STEP 3: Filter to YCDC 33 urban townships ───────────────
// These are the 33 township names under YCDC administration
// Source: Yangon City Development Committee official list

var ycdc_townships = [
  "Ahlone", "Bahan", "Botahtaung",
  "Dagon", "Dagon Myothit (East)", "Dagon Myothit (North)",
  "Dagon Myothit (Seikkan)", "Dagon Myothit (South)", "Dala",
  "Dawbon", "Hlaing", "Hlaingtharya (East)", "Hlaingtharya (West)",
  "Insein", "Kamaryut", "Kyauktada",
  "Kyeemyindaing", "Lanmadaw", "Latha", "Mayangone", "Mingaladon",
  "Mingalartaungnyunt",
  "North Okkalapa", "Pabedan", "Pazundaung", "Sanchaung",
  "Seikgyikanaungto", "Shwepyithar", "South Okkalapa",
  "Tamwe", "Thaketa", "Thingangyun", "Yankin"
  // ⚠️ Adjust these names to exactly match your shapefile's spelling
];

var yangon_33 = yangon_region.filter(
  ee.Filter.inList("TS", ycdc_townships)
);

print("YCDC townships loaded:", yangon_33.size());
// Should print close to 33 — if not, check spelling of township names

// ── STEP 4: Create merged boundary and buffer ────────────────

// Merge all 33 townships into one single boundary polygon
var yangon_boundary = yangon_33.union().geometry();

// Create 10km peri-urban buffer (for UHI reference zone)
var yangon_buffer = yangon_boundary.buffer(10000); // 10,000 metres = 10 km

// The reference zone = buffer MINUS the city boundary
var reference_zone = yangon_buffer.difference(yangon_boundary);

// ── STEP 5: Visualise everything ────────────────────────────

// Centre the map on Yangon
Map.setCenter(96.17, 16.87, 11);

// Add layers to map
Map.addLayer(
  yangon_33,
  {color: "blue"},
  "Yangon 33 Townships"
);

Map.addLayer(
  yangon_boundary,
  {color: "red"},
  "Yangon City Boundary"
);

Map.addLayer(
  reference_zone,
  {color: "orange", opacity: 0.3},
  "Peri-urban Reference Zone"
);

// ── STEP 6: Export boundary for use in QGIS ─────────────────
Export.table.toDrive({
  collection: yangon_33,
  description: "yangon_33_townships",
  fileFormat: "SHP"
});

// Press RUN — then go to Tasks tab and click RUN on the export task

// ============================================================
// CLOUD MASKING FUNCTION
// Must run this before median() for best results
// ============================================================

// ── How cloud masking works ──────────────────────────────────
// Each Landsat image has a QA_PIXEL band
// Each pixel in QA_PIXEL is a number where individual BITS
// tell you what is wrong with that pixel:
//   Bit 3 = Cloud
//   Bit 4 = Cloud Shadow
//   Bit 5 = Snow/Ice (not relevant for Yangon)
// If bit 3 OR bit 4 is set → mask that pixel (ignore it)

function maskClouds(image) {
  var qa = image.select("QA_PIXEL");
  
  // Check bit 3 (cloud): bitwiseAnd(1 << 3) tests if bit 3 is set
  var cloud = qa.bitwiseAnd(1 << 3).eq(0);        // 0 = no cloud ✓
  var shadow = qa.bitwiseAnd(1 << 4).eq(0);       // 0 = no shadow ✓
  
  // Keep only pixels where BOTH cloud and shadow bits are 0
  var mask = cloud.and(shadow);
  
  // Apply mask AND scale the pixel values
  // Landsat C2 L2 needs scaling: multiply by 0.0000275, add -0.2
  return image
    .updateMask(mask)
    .multiply(0.0000275)
    .add(-0.2)
    .copyProperties(image, ["system:time_start", "DATE_ACQUIRED"]);
    // copyProperties keeps the date info — needed later
}

// ── Apply cloud masking to your collection ───────────────────

// 2023
var l8_2023_masked = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_buffer)
  .filterDate("2023-03-01", "2023-04-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 30)) // slightly relaxed threshold
  .map(maskClouds);  // applies maskClouds() to EVERY image in collection

var composite_2023 = l8_2023_masked.median().clip(yangon_buffer);

// 2019
var l8_2019_masked = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_buffer)
  .filterDate("2019-03-01", "2019-04-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 30))
  .map(maskClouds);

var composite_2019 = l8_2019_masked.median().clip(yangon_buffer);

// 2015
var l8_2015_masked = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_buffer)
  .filterDate("2015-03-01", "2015-04-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 30))
  .map(maskClouds);

var composite_2015 = l8_2015_masked.median().clip(yangon_buffer);

// ── Visualise to check quality ───────────────────────────────
Map.addLayer(
  composite_2023,
  {bands: ["SR_B4", "SR_B3", "SR_B2"], min: 0, max: 0.3},
  "2023 Cloud-Masked Composite"
);

// After scaling, values are 0–1 (reflectance), so max is 0.3 not 20000
// Check: does Yangon look cloud-free? Pan around the map.
// If you still see white patches = clouds remaining
//   → try expanding date range: filterDate("2023-02-01", "2023-05-15")

// ============================================================
// SCRIPT 03: VEGETATION INDICES
// NDVI, EVI, NDWI, NDBI, SAVI, BSI
// ============================================================

// ── Band reference for Landsat 8/9 ──────────────────────────
// SR_B2 = Blue    (0.45–0.51 µm)
// SR_B3 = Green   (0.53–0.59 µm)
// SR_B4 = Red     (0.64–0.67 µm)
// SR_B5 = NIR     (0.85–0.88 µm)  ← Near Infrared
// SR_B6 = SWIR1   (1.57–1.65 µm)  ← Short Wave Infrared
// SR_B7 = SWIR2   (2.11–2.29 µm)
// ST_B10 = Thermal (10.6–11.19 µm) ← used for LST

// ── Function to calculate all indices ───────────────────────
function addIndices(image) {

  // NDVI: Normalised Difference Vegetation Index
  // Range: -1 to +1
  // High values (0.6–0.9) = dense vegetation
  // Low values (0–0.2)   = bare/built-up
  var NDVI = image.normalizedDifference(["SR_B5", "SR_B4"])
    .rename("NDVI");

  // EVI: Enhanced Vegetation Index
  // Better than NDVI in dense tropical canopy (no saturation)
  // Uses Blue band to correct atmosphere
  var EVI = image.expression(
    "2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))",
    {
      "NIR":  image.select("SR_B5"),
      "RED":  image.select("SR_B4"),
      "BLUE": image.select("SR_B2")
    }
  ).rename("EVI");

  // NDWI: Normalised Difference Water Index
  // High values = water bodies (rivers, lakes, ponds)
  var NDWI = image.normalizedDifference(["SR_B3", "SR_B5"])
    .rename("NDWI");

  // NDBI: Normalised Difference Built-up Index
  // High values = dense built-up / impervious surfaces
  var NDBI = image.normalizedDifference(["SR_B6", "SR_B5"])
    .rename("NDBI");

  // SAVI: Soil Adjusted Vegetation Index
  // Better than NDVI in areas with exposed soil (construction sites)
  // L=0.5 is standard for intermediate vegetation density
  var SAVI = image.expression(
    "((NIR - RED) / (NIR + RED + 0.5)) * 1.5",
    {
      "NIR": image.select("SR_B5"),
      "RED": image.select("SR_B4")
    }
  ).rename("SAVI");

  // BSI: Bare Soil Index
  // High values = bare soil, construction sites
  var BSI = image.expression(
    "((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))",
    {
      "SWIR": image.select("SR_B6"),
      "RED":  image.select("SR_B4"),
      "NIR":  image.select("SR_B5"),
      "BLUE": image.select("SR_B2")
    }
  ).rename("BSI");

  // Return original image with all new index bands added
  return image
    .addBands(NDVI)
    .addBands(EVI)
    .addBands(NDWI)
    .addBands(NDBI)
    .addBands(SAVI)
    .addBands(BSI);
}

// ── Apply to your composites ─────────────────────────────────
// (composite_2023, composite_2019, composite_2015 from Script 02)

var image_2023 = addIndices(composite_2023);
var image_2019 = addIndices(composite_2019);
var image_2015 = addIndices(composite_2015);

// ── Visualise NDVI and EVI ───────────────────────────────────
var ndvi_palette = [
  "d73027",  // dark red = very low NDVI (built-up/bare)
  "f46d43",  // red
  "fdae61",  // orange
  "fee08b",  // yellow
  "d9ef8b",  // light green
  "91cf60",  // green = moderate vegetation
  "1a9850"   // dark green = dense vegetation
];

Map.addLayer(
  image_2023.select("NDVI").clip(yangon_boundary),
  {min: 0, max: 0.8, palette: ndvi_palette},
  "NDVI 2023"
);

Map.addLayer(
  image_2023.select("EVI").clip(yangon_boundary),
  {min: 0, max: 0.8, palette: ndvi_palette},
  "EVI 2023"
);

Map.addLayer(
  image_2023.select("NDBI").clip(yangon_boundary),
  {min: -0.5, max: 0.5, palette: ["blue", "white", "red"]},
  "NDBI 2023 (red = built-up)"
);

// ── Print statistics ─────────────────────────────────────────
// Mean NDVI across Yangon
var ndvi_stats = image_2023.select("NDVI").reduceRegion({
  reducer: ee.Reducer.mean().combine({
    reducer2: ee.Reducer.minMax(),
    sharedInputs: true
  }),
  geometry: yangon_boundary,
  scale: 30,
  maxPixels: 1e10
});
print("NDVI statistics (2023):", ndvi_stats);
// Console shows: NDVI_mean, NDVI_min, NDVI_max

// ============================================================
// SCRIPT 04: LAND SURFACE TEMPERATURE (LST)
// Mono-Window Algorithm using Landsat 8/9 Band 10
// ============================================================

// ── Why we need a special approach for thermal band ─────────
// The thermal band (ST_B10) in Landsat C2 L2 is ALREADY
// processed to surface temperature by USGS.
// We just need to:
//   1. Apply the correct scale factor
//   2. Convert Kelvin to Celsius
// That's it — no complex algorithm needed for C2 L2!

// ── LST Calculation Function ─────────────────────────────────

function calculateLST(image) {

  // The ST_B10 band in Collection 2 Level 2 is surface temperature
  // Scale factor: multiply by 0.00341802, add 149.0 → gives Kelvin
  // Then subtract 273.15 → gives Celsius

  var LST_kelvin = image.select("ST_B10")
    .multiply(0.00341802)
    .add(149.0);

  var LST_celsius = LST_kelvin
    .subtract(273.15)
    .rename("LST");

  return image.addBands(LST_celsius);
}

// ── BUT WAIT: The collections from Script 02 were scaled ─────
// The maskClouds() function scaled optical bands (SR_B2–B7)
// The thermal band (ST_B10) needs SEPARATE loading — it was
// NOT scaled correctly in our earlier function
// Solution: load thermal band separately

function maskCloudsAndLST(image) {
  var qa = image.select("QA_PIXEL");
  var cloud = qa.bitwiseAnd(1 << 3).eq(0);
  var shadow = qa.bitwiseAnd(1 << 4).eq(0);
  var mask = cloud.and(shadow);

  // Scale optical bands
  var optical = image.select("SR_B.*")
    .multiply(0.0000275).add(-0.2);

  // Scale thermal band SEPARATELY
  var thermal = image.select("ST_B10")
    .multiply(0.00341802).add(149.0)
    .subtract(273.15)
    .rename("LST");

  return optical
    .addBands(thermal)
    .updateMask(mask)
    .copyProperties(image, ["system:time_start", "DATE_ACQUIRED"]);
}

// ── Apply and create composites with LST ─────────────────────

var l8_2023_full = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_buffer)
  .filterDate("2023-03-01", "2023-04-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 30))
  .map(maskCloudsAndLST)
  .median()
  .clip(yangon_buffer);

var l8_2019_full = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_buffer)
  .filterDate("2019-03-01", "2019-04-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 30))
  .map(maskCloudsAndLST)
  .median()
  .clip(yangon_buffer);

var l8_2015_full = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_buffer)
  .filterDate("2015-03-01", "2015-04-30")
  .filter(ee.Filter.lt("CLOUD_COVER", 30))
  .map(maskCloudsAndLST)
  .median()
  .clip(yangon_buffer);

// ── Add vegetation indices ───────────────────────────────────
var full_2023 = addIndices(l8_2023_full);
var full_2019 = addIndices(l8_2019_full);
var full_2015 = addIndices(l8_2015_full);

// ── Visualise LST ────────────────────────────────────────────
var lst_palette = [
  "040274", "040281", "0502a3", "0502b8", "0602ff",
  "235cb1", "307ef3", "269db1", "30c8e2", "32d3ef",
  "3be285", "3ff38f", "86e26f", "3ae237", "b5e22e",
  "d6e21f", "fff705", "ffd611", "ffb613", "ff8b13",
  "ff6e08", "ff500d", "ff0000", "de0101", "c21301"
];
// Blue = cool, Red = hot (classic thermal map colours)

Map.addLayer(
  full_2023.select("LST").clip(yangon_boundary),
  {min: 25, max: 45, palette: lst_palette},
  "LST 2023 (°C)"
);

// ── Print LST statistics by township ─────────────────────────
var lst_by_township = full_2023.select("LST").reduceRegions({
  collection: yangon_33,
  reducer: ee.Reducer.mean().combine({
    reducer2: ee.Reducer.minMax(),
    sharedInputs: true
  }),
  scale: 30
});

print("LST by township (2023):", lst_by_township);
// In Console: expand to see each township's mean/min/max LST
// The hottest townships will have highest LST_mean values

// ============================================================
// SCRIPT 05: UHI INTENSITY CALCULATION
// ============================================================

// ── What is UHI Intensity? ───────────────────────────────────
// UHI Intensity = LST at each urban pixel MINUS
//                 mean LST of peri-urban reference zone
// Positive = hotter than surroundings = urban heat island
// Negative = cooler than surroundings (parks, water bodies)

// reference_zone was defined in Script 01 (10km buffer minus city)

// ── Calculate mean LST in reference zone ─────────────────────
var ref_lst_2023 = full_2023.select("LST").reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: reference_zone,
  scale: 30,
  maxPixels: 1e10
});

var ref_temp_2023 = ee.Number(ref_lst_2023.get("LST"));
print("Reference zone mean LST (2023):", ref_temp_2023);
// Typical value: 28–32°C for Yangon peri-urban in March

// ── Calculate UHI intensity ───────────────────────────────────
var UHI_2023 = full_2023.select("LST")
  .subtract(ref_temp_2023)
  .rename("UHI_intensity")
  .clip(yangon_boundary);

// ── Visualise UHI intensity ───────────────────────────────────
// Diverging palette: blue (cool) → white (neutral) → red (hot)
Map.addLayer(
  UHI_2023,
  {min: -4, max: 6, palette: ["0000ff", "ffffff", "ff0000"]},
  "UHI Intensity 2023"
);

// ── Classify UHI into categories ─────────────────────────────
// For hot spot mapping — classify into 5 heat zones
var UHI_classified = UHI_2023
  .where(UHI_2023.lt(-2), 1)              // 1 = Cool Island
  .where(UHI_2023.gte(-2).and(UHI_2023.lt(0)), 2)  // 2 = Slightly Cool
  .where(UHI_2023.gte(0).and(UHI_2023.lt(2)), 3)   // 3 = Neutral
  .where(UHI_2023.gte(2).and(UHI_2023.lt(4)), 4)   // 4 = Warm Island
  .where(UHI_2023.gte(4), 5);             // 5 = Hot Island

Map.addLayer(
  UHI_classified,
  {min: 1, max: 5,
   palette: ["0000ff", "87ceeb", "ffffff", "ff8c00", "ff0000"]},
  "UHI Categories 2023"
);

// ── UHI statistics by township ────────────────────────────────
var uhi_by_township = UHI_2023.reduceRegions({
  collection: yangon_33,
  reducer: ee.Reducer.mean(),
  scale: 30
});

print("UHI intensity by township:", uhi_by_township);

// ── LST temporal change (2015 → 2023) ────────────────────────
var LST_change = full_2023.select("LST")
  .subtract(full_2015.select("LST"))
  .rename("LST_change")
  .clip(yangon_boundary);

Map.addLayer(
  LST_change,
  {min: -3, max: 5, palette: ["0000ff", "ffffff", "ff0000"]},
  "LST Change 2015→2023 (red=warming)"
);

print("Mean LST change 2015-2023:", LST_change.reduceRegion({
  reducer: ee.Reducer.mean(),
  geometry: yangon_boundary,
  scale: 30,
  maxPixels: 1e10
}));

// ============================================================
// SCRIPT 06: SENTINEL-2 IMAGERY
// Higher resolution (10m) for LULC classification
// ============================================================

// ── Why Sentinel-2 for LULC? ─────────────────────────────────
// Landsat = 30m resolution → each pixel is 30m × 30m
// Sentinel-2 = 10m resolution → each pixel is 10m × 10m
// For detecting parks, vegetation patches, small water bodies:
// 10m is MUCH better than 30m

// ── Sentinel-2 Band Reference ─────────────────────────────────
// B2  = Blue  (10m)
// B3  = Green (10m)
// B4  = Red   (10m)
// B8  = NIR   (10m)   ← Near Infrared
// B11 = SWIR1 (20m)   ← Short Wave Infrared (resampled to 10m)
// B12 = SWIR2 (20m)

// ── Cloud masking for Sentinel-2 ─────────────────────────────
function maskS2clouds(image) {
  var scl = image.select("SCL");  // Scene Classification Layer
  // SCL values to remove:
  // 3 = cloud shadows
  // 8 = medium probability clouds
  // 9 = high probability clouds
  // 10 = thin cirrus
  var mask = scl.neq(3)
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10));
  return image
    .updateMask(mask)
    .divide(10000)  // Sentinel-2 DN to reflectance: divide by 10000
    .copyProperties(image, ["system:time_start"]);
}

// ── Load Sentinel-2 for 2023 ─────────────────────────────────
var s2_2023 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(yangon_boundary)
  .filterDate("2023-02-01", "2023-05-31")  // wider window for S2
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
  .map(maskS2clouds)
  .select(["B2","B3","B4","B8","B11","B12"]) // keep only needed bands
  .median()
  .clip(yangon_boundary);

print("Sentinel-2 2023 bands:", s2_2023.bandNames());

// ── Add Sentinel-2 vegetation indices ────────────────────────
function addS2Indices(image) {
  var NDVI = image.normalizedDifference(["B8","B4"]).rename("NDVI");
  var EVI = image.expression(
    "2.5 * ((NIR-RED) / (NIR + 6*RED - 7.5*BLUE + 1))",
    {"NIR":image.select("B8"),"RED":image.select("B4"),"BLUE":image.select("B2")}
  ).rename("EVI");
  var NDWI = image.normalizedDifference(["B3","B8"]).rename("NDWI");
  var NDBI = image.normalizedDifference(["B11","B8"]).rename("NDBI");
  var SAVI = image.expression(
    "((NIR-RED)/(NIR+RED+0.5))*1.5",
    {"NIR":image.select("B8"),"RED":image.select("B4")}
  ).rename("SAVI");
  var BSI = image.expression(
    "((SWIR+RED)-(NIR+BLUE))/((SWIR+RED)+(NIR+BLUE))",
    {"SWIR":image.select("B11"),"RED":image.select("B4"),
     "NIR":image.select("B8"),"BLUE":image.select("B2")}
  ).rename("BSI");
  return image.addBands([NDVI,EVI,NDWI,NDBI,SAVI,BSI]);
}

var s2_2023_idx = addS2Indices(s2_2023);

// ── Also load ESA WorldCover for validation ───────────────────
var worldcover = ee.ImageCollection("ESA/WorldCover/v200")
  .first()
  .clip(yangon_boundary);

// WorldCover classes:
// 10 = Tree cover
// 20 = Shrubland
// 30 = Grassland
// 40 = Cropland
// 50 = Built-up
// 60 = Bare/sparse vegetation
// 80 = Permanent water bodies
// 90 = Herbaceous wetland

Map.addLayer(worldcover,
  {min:10, max:95,
   palette:["006400","ffbb22","ffff4c","f096ff","fa0000",
            "b4b4b4","f0f0f0","0064c8","0096a0"]},
  "ESA WorldCover 2021"
);

// ── Visualise Sentinel-2 true colour ─────────────────────────
Map.addLayer(
  s2_2023,
  {bands:["B4","B3","B2"], min:0, max:0.3},
  "Sentinel-2 2023 True Colour"
);

// ============================================================
// SCRIPT 07: LULC CLASSIFICATION
// Random Forest classifier using Sentinel-2
// ============================================================

// ── STEP 1: Define land cover classes ────────────────────────
// You need to collect training samples for each class
// Do this by drawing polygons on the map

// Class definitions:
// 1 = Dense tree canopy (parks with mature trees, remnant forest)
// 2 = Mixed vegetation / grass (open parks, grass areas, gardens)
// 3 = Water body (Inya Lake, Kandawgyi Lake, rivers, ponds)
// 4 = High-density built-up (dense commercial/residential core)
// 5 = Low-medium density built-up (suburban, industrial)
// 6 = Bare soil / impervious (construction sites, roads)

// ── STEP 2: Collect training samples ─────────────────────────
// HOW TO DRAW TRAINING SAMPLES:
// 1. In the map panel, zoom into an area you recognise
//    (e.g., Kandawgyi Park = class 1, Kyauktada centre = class 4)
// 2. In the top-left of the map, select the polygon tool (■)
// 3. Draw a polygon over a clearly identifiable area
// 4. In the dialog that appears:
//    - Name the geometry: "class_1_samples" (or similar)
//    - Click "Add property" → name: "class" → value: 1
// 5. Repeat for each class — draw 15–25 polygons per class
// 6. Aim for geographic spread — don't cluster all samples
//    in one part of the city

// After drawing, your training polygons appear as variables
// in the code (GEE adds them automatically)

// ── STEP 3: Merge all training samples ───────────────────────
// After drawing all polygons, merge them:
// (GEE auto-creates variables for your drawn geometries)

var training_samples = class_1_dense_tree
  .merge(class_2_mixed_vegetation)
  .merge(class_3_water)
  .merge(class_4_high_density_builtup)
  .merge(class_5_low_density_builtup)
  .merge(class_6_bare_soil);

// ── STEP 4: Create input feature stack ───────────────────────
// These are all the bands the classifier will use
var input_bands = ["B2","B3","B4","B8","B11","B12",
                   "NDVI","EVI","NDWI","NDBI","SAVI","BSI"];

var input_image = s2_2023_idx.select(input_bands);

// ── STEP 5: Sample training data ─────────────────────────────
var training_data = input_image.sampleRegions({
  collection: training_samples,
  properties: ["class"],  // the property you set when drawing
  scale: 10,              // 10m = Sentinel-2 resolution
  tileScale: 4            // helps with memory if error occurs
});

print("Training samples count:", training_data.size());
// Should be several thousand pixels across all classes

// ── STEP 6: Train Random Forest classifier ───────────────────
var classifier = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,    // 100 trees — good balance of speed/accuracy
  seed: 42               // fixed seed for reproducibility
}).train({
  features: training_data,
  classProperty: "class",
  inputProperties: input_bands
});

// ── STEP 7: Classify the image ───────────────────────────────
var classified_2023 = input_image
  .classify(classifier)
  .rename("LULC")
  .clip(yangon_boundary);

// ── STEP 8: Visualise ────────────────────────────────────────
var lulc_palette = [
  "1a9641",  // 1 = Dense tree (dark green)
  "a6d96a",  // 2 = Mixed vegetation (light green)
  "4575b4",  // 3 = Water (blue)
  "d73027",  // 4 = High-density built-up (dark red)
  "fdae61",  // 5 = Low-density built-up (orange)
  "d9d9d9"   // 6 = Bare soil (grey)
];

Map.addLayer(
  classified_2023,
  {min:1, max:6, palette: lulc_palette},
  "LULC 2023"
);

// ── STEP 9: Accuracy assessment ──────────────────────────────
// Split training data: 70% train, 30% validate
var training_data_split = training_data.randomColumn("random", 42);
var train_set = training_data_split.filter(ee.Filter.lt("random", 0.7));
var test_set  = training_data_split.filter(ee.Filter.gte("random", 0.7));

// Retrain on 70%
var classifier_validated = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,
  seed: 42
}).train({
  features: train_set,
  classProperty: "class",
  inputProperties: input_bands
});

// Test on 30%
var validated = test_set.classify(classifier_validated);
var confusion_matrix = validated.errorMatrix("class", "classification");

print("Confusion Matrix:", confusion_matrix);
print("Overall Accuracy:", confusion_matrix.accuracy());
print("Kappa Coefficient:", confusion_matrix.kappa());
// Target: Accuracy > 85%, Kappa > 0.80

// ── STEP 10: Calculate LULC area statistics ──────────────────
var lulc_area = classified_2023.eq(1).multiply(ee.Image.pixelArea())
  .reduceRegion({
    reducer: ee.Reducer.sum(),
    geometry: yangon_boundary,
    scale: 10,
    maxPixels: 1e10
  });
print("Dense tree canopy area (m²):", lulc_area);
// Divide by 10000 for hectares, by 1000000 for km²

// ============================================================
// SCRIPT 08: POPULATION AND AUXILIARY DATA
// WorldPop, Meta HRSL, SRTM, GHSL
// ============================================================

// ── WorldPop Total Population ─────────────────────────────────
var worldpop = ee.ImageCollection("WorldPop/GP/100m/pop")
  .filter(ee.Filter.eq("country", "MMR"))  // Myanmar
  .filter(ee.Filter.eq("year", 2020))
  .first()
  .clip(yangon_boundary);

print("WorldPop band name:", worldpop.bandNames());

Map.addLayer(
  worldpop,
  {min:0, max:500, palette:["white","yellow","orange","red"]},
  "Population Density 2020"
);

// ── SRTM Elevation and Slope ──────────────────────────────────
var srtm = ee.Image("USGS/SRTMGL1_003").clip(yangon_buffer);
var elevation = srtm.select("elevation");
var slope = ee.Terrain.slope(srtm);

Map.addLayer(elevation, {min:0, max:50, palette:["green","yellow","brown"]},
  "Elevation");
Map.addLayer(slope, {min:0, max:10, palette:["white","orange","red"]},
  "Slope");

// ── GHSL Built-up Height (CHECK if available for Myanmar) ────
// Run this to see if height data exists for Yangon:
var ghsl_height = ee.ImageCollection("JRC/GHSL/P2023A/GHS_BUILT_H")
  .filterBounds(yangon_boundary)
  .first();

// Check if it returned anything:
print("GHSL Height available?", ghsl_height);
// If it shows an image with values → great, you have height data!
// If it shows null or zeros everywhere → not available for Myanmar

Map.addLayer(
  ghsl_height.select(0).clip(yangon_boundary),
  {min:0, max:20, palette:["white","yellow","orange","red"]},
  "GHSL Building Height (check if valid)"
);

// ── GHSL Built-up Surface (density by epoch) ─────────────────
var ghsl_built = ee.Image("JRC/GHSL/P2023A/GHS_BUILT_S/2020")
  .clip(yangon_boundary);
  
var ghsl_built_single = ghsl_built.select(0).rename("builtup_density");

Map.addLayer(
  ghsl_built_single,
  {min:0, max:10000, palette:["white","orange","red"]},
  "GHSL Built-up Surface 2020"
);

// ── ESA WorldCover (already loaded in Script 06) ─────────────
// Use for cross-validation of your LULC classification

// ── Calculate distance to city centre ────────────────────────
// City centre = Sule Pagoda / Kyauktada township
var city_centre = ee.Geometry.Point([96.1605, 16.7753]);

var dist_to_centre = ee.Image.pixelLonLat()
  .expression(
    "sqrt((lon - cx)*(lon - cx) + (lat - cy)*(lat - cy)) * 111320",
    // 111320 converts degrees to approximate metres at equator
    {
      "lon": ee.Image.pixelLonLat().select("longitude"),
      "lat": ee.Image.pixelLonLat().select("latitude"),
      "cx": 96.1605,
      "cy": 16.7753
    }
  ).rename("dist_centre")
  .clip(yangon_boundary);

Map.addLayer(
  dist_to_centre,
  {min:0, max:30000, palette:["red","yellow","blue"]},
  "Distance to City Centre"
);

// ============================================================
// SCRIPT 09: FEATURE EXTRACTION TO GRID
// Create the master dataset for ML in Python
// ============================================================

// ── Create 100m analysis grid ─────────────────────────────────
// Method: use pixelLonLat at 100m scale — GEE handles this
// internally when you specify scale:100 in reduceRegions

// ── Stack all feature layers into one image ───────────────────
var feature_stack = full_2023.select("LST")        // TARGET variable
  .addBands(full_2023.select("NDVI"))
  .addBands(full_2023.select("EVI"))
  .addBands(full_2023.select("NDWI"))
  .addBands(full_2023.select("NDBI"))
  .addBands(full_2023.select("SAVI"))
  .addBands(full_2023.select("BSI"))
  .addBands(elevation.rename("elevation"))
  .addBands(slope.rename("slope"))
  .addBands(dist_to_centre.rename("dist_centre"))
  .addBands(worldpop.rename("population"))
  .addBands(ghsl_built_single);

// ── Sample at 100m across Yangon ─────────────────────────────
var sampled = feature_stack.sample({
  region: yangon_boundary,
  scale: 100,            // 100m grid
  projection: "EPSG:32647",  // UTM Zone 47N (correct for Yangon)
  seed: 42,
  geometries: true       // KEEP geometry — needed for spatial analysis
});

print("Feature grid sample count:", sampled.size());
// Should be around 60,000–80,000 points for Yangon at 100m

// ── Export to Google Drive as CSV ─────────────────────────────
Export.table.toDrive({
  collection: sampled,
  description: "yangon_features_2023_100m",
  folder: "Yangon_Thesis",           // folder name in your Drive
  fileNamePrefix: "features_2023",
  fileFormat: "CSV"
});

// ── Also export as GeoTIFF rasters ───────────────────────────
// LST raster
Export.image.toDrive({
  image: full_2023.select("LST").clip(yangon_boundary),
  description: "LST_2023",
  folder: "Yangon_Thesis",
  fileNamePrefix: "LST_2023",
  region: yangon_boundary,
  scale: 30,
  crs: "EPSG:32647",
  maxPixels: 1e10
});

// UHI intensity raster
Export.image.toDrive({
  image: UHI_2023.clip(yangon_boundary),
  description: "UHI_2023",
  folder: "Yangon_Thesis",
  fileNamePrefix: "UHI_2023",
  region: yangon_boundary,
  scale: 30,
  crs: "EPSG:32647",
  maxPixels: 1e10
});

// LULC classification raster
Export.image.toDrive({
  image: classified_2023.clip(yangon_boundary),
  description: "LULC_2023",
  folder: "Yangon_Thesis",
  fileNamePrefix: "LULC_2023",
  region: yangon_boundary,
  scale: 10,
  crs: "EPSG:32647",
  maxPixels: 1e10
});

// NDVI raster
Export.image.toDrive({
  image: s2_2023_idx.select("NDVI").clip(yangon_boundary),
  description: "NDVI_2023_S2",
  folder: "Yangon_Thesis",
  fileNamePrefix: "NDVI_2023",
  region: yangon_boundary,
  scale: 10,
  crs: "EPSG:32647",
  maxPixels: 1e10
});

// ── HOW TO RUN EXPORTS ────────────────────────────────────────
// 1. Click RUN (top of code editor)
// 2. Click "Tasks" tab (top right of interface)
// 3. You see all your export tasks listed — click RUN on each one
// 4. They run in Google's cloud — check back in 5–30 minutes
// 5. Files appear in your Google Drive → Yangon_Thesis folder
// 6. Download from Drive to your laptop for use in QGIS / Python

// ============================================================
// SCRIPT 10: TEMPORAL CHANGE ANALYSIS
// Compare LST and LULC across three time periods
// ============================================================

// ============================================================
// TEMPORAL ANALYSIS — COMPLETE SCRIPT
// Yangon Urban Heat Stress Thesis
// Copy this entire block and REPLACE your current
// temporal analysis section (from line 927 onwards)
// ============================================================
// IMPORTANT: This code assumes these variables already exist
// from your earlier scripts above:
//   - yangon_boundary, yangon_33
//   - full_2023, full_2019, full_2015  (Landsat LST composites)
//   - classified_2023                  (your 2023 LULC)
//   - s2_2023_idx                      (Sentinel-2 2023 with indices)
//   - input_bands                      (Sentinel-2 band list)
//   - training_samples                 (your drawn polygons)
//   - classifier                       (your trained RF classifier)
//   - maskS2clouds, addS2Indices       (your functions)
//   - maskCloudsAndLST                 (your Landsat function)
// ============================================================


// ============================================================
// PART A: LST CHANGE MAPS
// ============================================================

// ── LST change 2015 → 2023 (8 year change) ───────────────────
var LST_change_2015_2023 = full_2023.select("LST")
  .subtract(full_2015.select("LST"))
  .rename("LST_change_8yr");

// ── LST change 2019 → 2023 (4 year change) ───────────────────
var LST_change_2019_2023 = full_2023.select("LST")
  .subtract(full_2019.select("LST"))
  .rename("LST_change_4yr");

// ── Visualise LST change maps ─────────────────────────────────
// Blue = cooling, White = no change, Red = warming
Map.addLayer(
  LST_change_2015_2023.clip(yangon_boundary),
  {min: -3, max: 5, palette: ["0000ff", "ffffff", "ff0000"]},
  "LST Change 2015→2023 (red=warming)"
);

Map.addLayer(
  LST_change_2019_2023.clip(yangon_boundary),
  {min: -3, max: 5, palette: ["0000ff", "ffffff", "ff0000"]},
  "LST Change 2019→2023"
);

print("LST change maps created ✅");


// ============================================================
// PART B: NDVI CHANGE MAP
// ============================================================

// ── NDVI change 2015 → 2023 ───────────────────────────────────
// Negative = vegetation lost, Positive = vegetation gained
var NDVI_change = full_2023.select("NDVI")
  .subtract(full_2015.select("NDVI"))
  .rename("NDVI_change");

Map.addLayer(
  NDVI_change.clip(yangon_boundary),
  {min: -0.4, max: 0.4, palette: ["ff0000", "ffffff", "00aa00"]},
  "NDVI Change 2015→2023 (red=loss, green=gain)"
);

print("NDVI change map created ✅");


// ============================================================
// PART C: 2015 LULC CLASSIFICATION USING LANDSAT 8
// Sentinel-2 launched March 2015 — zero coverage over Yangon
// in early 2015. Landsat 8 (operational since 2013) is used
// instead. This is standard practice and will be documented
// in the methodology chapter.
// ============================================================

// ── Check S2 2015 availability (will print 0) ─────────────────
print("S2 2015 available images (expect 0):",
  ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(yangon_boundary)
    .filterDate("2015-01-01", "2015-12-31")
    .size()
);

// ── Load Landsat 8 for 2015 LULC ─────────────────────────────
var l8_2015_lulc = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
  .filterBounds(yangon_boundary)
  .filterDate("2015-01-01", "2015-05-31")
  .filter(ee.Filter.lt("CLOUD_COVER", 40))
  .map(maskCloudsAndLST)
  .median()
  .clip(yangon_boundary);

// Check how many images were found
print("Landsat 8 2015 image count (expect 3+):",
  ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    .filterBounds(yangon_boundary)
    .filterDate("2015-01-01", "2015-05-31")
    .filter(ee.Filter.lt("CLOUD_COVER", 40))
    .size()
);

// ── Function: Add indices using Landsat 8 band names ──────────
// Landsat uses SR_B2–SR_B7, Sentinel-2 uses B2–B12
// Index formulas are identical — only band names differ
function addL8Indices(image) {
  var NDVI = image.normalizedDifference(["SR_B5", "SR_B4"])
    .rename("NDVI");
  var EVI = image.expression(
    "2.5 * ((NIR - RED) / (NIR + 6*RED - 7.5*BLUE + 1))",
    {
      "NIR":  image.select("SR_B5"),
      "RED":  image.select("SR_B4"),
      "BLUE": image.select("SR_B2")
    }
  ).rename("EVI");
  var NDWI = image.normalizedDifference(["SR_B3", "SR_B5"])
    .rename("NDWI");
  var NDBI = image.normalizedDifference(["SR_B6", "SR_B5"])
    .rename("NDBI");
  var SAVI = image.expression(
    "((NIR - RED) / (NIR + RED + 0.5)) * 1.5",
    {
      "NIR": image.select("SR_B5"),
      "RED": image.select("SR_B4")
    }
  ).rename("SAVI");
  var BSI = image.expression(
    "((SWIR + RED) - (NIR + BLUE)) / ((SWIR + RED) + (NIR + BLUE))",
    {
      "SWIR": image.select("SR_B6"),
      "RED":  image.select("SR_B4"),
      "NIR":  image.select("SR_B5"),
      "BLUE": image.select("SR_B2")
    }
  ).rename("BSI");
  return image.addBands([NDVI, EVI, NDWI, NDBI, SAVI, BSI]);
}

// ── Add indices to 2015 Landsat image ─────────────────────────
var l8_2015_idx = addL8Indices(l8_2015_lulc);

// ── Landsat 8 input band list ─────────────────────────────────
// Different from Sentinel-2 input_bands — uses SR_B2 to SR_B7
var l8_input_bands = [
  "SR_B2", "SR_B3", "SR_B4", "SR_B5", "SR_B6", "SR_B7",
  "NDVI", "EVI", "NDWI", "NDBI", "SAVI", "BSI"
];

// ── Sample training data from Landsat image ───────────────────
// Cannot reuse the Sentinel-2 classifier — different band names
// Must train a new classifier on Landsat bands
var training_data_l8 = l8_2015_idx.select(l8_input_bands)
  .sampleRegions({
    collection: training_samples,  // same polygons you drew earlier
    properties: ["class"],
    scale: 30,                     // Landsat resolution = 30m
    tileScale: 4
  });

print("Landsat training samples count:", training_data_l8.size());

// ── Train Random Forest classifier for Landsat bands ──────────
var classifier_l8 = ee.Classifier.smileRandomForest({
  numberOfTrees: 100,
  seed: 42
}).train({
  features: training_data_l8,
  classProperty: "class",
  inputProperties: l8_input_bands
});

// ── Classify 2015 image ───────────────────────────────────────
var classified_2015 = l8_2015_idx.select(l8_input_bands)
  .classify(classifier_l8)
  .rename("LULC")
  .clip(yangon_boundary);

print("classified_2015 ready ✅ (Landsat 8, 30m)");

// ── LULC colour palette (reused for all three years) ──────────
var lulc_palette = [
  "1a9641",  // 1 = Dense tree (dark green)
  "a6d96a",  // 2 = Mixed vegetation (light green)
  "4575b4",  // 3 = Water (blue)
  "d73027",  // 4 = High-density built-up (dark red)
  "fdae61",  // 5 = Low-density built-up (orange)
  "d9d9d9"   // 6 = Bare soil (grey)
];

Map.addLayer(
  classified_2015,
  {min: 1, max: 6, palette: lulc_palette},
  "LULC 2015 (Landsat 8)"
);


// ============================================================
// PART D: 2019 LULC CLASSIFICATION USING SENTINEL-2
// Sentinel-2 had good coverage over Yangon by 2019
// ============================================================

// ── Load Sentinel-2 for 2019 ──────────────────────────────────
var s2_2019 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(yangon_boundary)
  .filterDate("2019-01-01", "2019-05-31")
  .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
  .map(maskS2clouds)
  .select(["B2", "B3", "B4", "B8", "B11", "B12"])
  .median()
  .clip(yangon_boundary);

// Check image count
print("S2 2019 image count (expect 5+):",
  ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(yangon_boundary)
    .filterDate("2019-01-01", "2019-05-31")
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
    .size()
);

// ── Add indices to 2019 ───────────────────────────────────────
var s2_2019_idx = addS2Indices(s2_2019);

// ── Classify 2019 using same Sentinel-2 classifier ───────────
// Use the same 'classifier' variable trained on your 2023 S2 image
// This ensures fair comparison across 2019 and 2023
var classified_2019 = s2_2019_idx.select(input_bands)
  .classify(classifier)
  .rename("LULC")
  .clip(yangon_boundary);

print("classified_2019 ready ✅ (Sentinel-2, 10m)");

Map.addLayer(
  classified_2019,
  {min: 1, max: 6, palette: lulc_palette},
  "LULC 2019 (Sentinel-2)"
);

// Also show 2023 again for easy comparison
Map.addLayer(
  classified_2023,
  {min: 1, max: 6, palette: lulc_palette},
  "LULC 2023 (Sentinel-2)"
);


// ============================================================
// PART E: VEGETATION AREA COMPARISON 2015 vs 2023
// Classes 1 + 2 = all vegetation (dense tree + mixed veg)
// ============================================================

// ── Calculate vegetated pixels × pixel area ───────────────────
var veg_2015 = classified_2015
  .lte(2)                          // class 1 or 2 = vegetation
  .multiply(ee.Image.pixelArea()); // multiply by pixel area in m²

var veg_2019 = classified_2019
  .lte(2)
  .multiply(ee.Image.pixelArea());

var veg_2023 = classified_2023
  .lte(2)
  .multiply(ee.Image.pixelArea());

// ── Sum total vegetation area ─────────────────────────────────
// Note: 2015 uses scale:30 (Landsat), 2019/2023 use scale:10 (S2)
var veg_area_2015 = veg_2015.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 30,            // Landsat resolution
  maxPixels: 1e10
});

var veg_area_2019 = veg_2019.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 10,            // Sentinel-2 resolution
  maxPixels: 1e10
});

var veg_area_2023 = veg_2023.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 10,            // Sentinel-2 resolution
  maxPixels: 1e10
});

// ── Print results ─────────────────────────────────────────────
// Divide by 1,000,000 to convert m² → km² in your thesis table
print("=== VEGETATION AREA RESULTS ===");
print("Vegetation area 2015 (m²) — Landsat:", veg_area_2015);
print("Vegetation area 2019 (m²) — Sentinel-2:", veg_area_2019);
print("Vegetation area 2023 (m²) — Sentinel-2:", veg_area_2023);
print("(Divide by 1000000 for km², divide by 10000 for hectares)");

// ── Dense tree canopy only (class 1) ─────────────────────────
var tree_2015 = classified_2015.eq(1).multiply(ee.Image.pixelArea());
var tree_2023 = classified_2023.eq(1).multiply(ee.Image.pixelArea());

var tree_area_2015 = tree_2015.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 30, maxPixels: 1e10
});
var tree_area_2023 = tree_2023.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 10, maxPixels: 1e10
});

print("Dense tree canopy 2015 (m²):", tree_area_2015);
print("Dense tree canopy 2023 (m²):", tree_area_2023);


// ============================================================
// PART F: TOWNSHIP-LEVEL SUMMARY TABLE
// Mean LST for each township across all three years
// This becomes your key thesis table
// ============================================================

var summary_2015 = full_2015.select("LST")
  .reduceRegions({
    collection: yangon_33,
    reducer: ee.Reducer.mean(),
    scale: 30
  })
  .map(function(f) { return f.set("year", 2015); });

var summary_2019 = full_2019.select("LST")
  .reduceRegions({
    collection: yangon_33,
    reducer: ee.Reducer.mean(),
    scale: 30
  })
  .map(function(f) { return f.set("year", 2019); });

var summary_2023 = full_2023.select("LST")
  .reduceRegions({
    collection: yangon_33,
    reducer: ee.Reducer.mean(),
    scale: 30
  })
  .map(function(f) { return f.set("year", 2023); });

// Merge all years into one table
var all_years_summary = summary_2015
  .merge(summary_2019)
  .merge(summary_2023);

print("Township LST summary (all years):", all_years_summary.limit(5));

// Export as CSV → this becomes your thesis results table
Export.table.toDrive({
  collection: all_years_summary,
  description: "LST_by_township_all_years",
  folder: "Yangon_Thesis",
  fileNamePrefix: "LST_township_summary",
  fileFormat: "CSV"
});


// ============================================================
// PART G: LULC CHANGE STATISTICS
// How much built-up expanded? How much green was lost?
// ============================================================

// ── Built-up area change (classes 4 + 5) ─────────────────────
var builtup_2015 = classified_2015.gte(4).and(classified_2015.lte(5))
  .multiply(ee.Image.pixelArea());
var builtup_2023 = classified_2023.gte(4).and(classified_2023.lte(5))
  .multiply(ee.Image.pixelArea());

var builtup_area_2015 = builtup_2015.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 30, maxPixels: 1e10
});
var builtup_area_2023 = builtup_2023.reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: yangon_boundary,
  scale: 10, maxPixels: 1e10
});

print("=== BUILT-UP AREA CHANGE ===");
print("Built-up area 2015 (m²):", builtup_area_2015);
print("Built-up area 2023 (m²):", builtup_area_2023);

// ── LULC area per class per township ─────────────────────────
// For detailed change matrix in your thesis
var lulc_stats_2023 = classified_2023.reduceRegions({
  collection: yangon_33,
  reducer: ee.Reducer.frequencyHistogram(),
  scale: 10
});

print("LULC frequency by township 2023:", lulc_stats_2023.limit(3));

Export.table.toDrive({
  collection: lulc_stats_2023,
  description: "LULC_by_township_2023",
  folder: "Yangon_Thesis",
  fileNamePrefix: "LULC_township_2023",
  fileFormat: "CSV"
});


// ============================================================
// PART H: MASTER EXPORT LIST
// All raster outputs for use in QGIS and Python ML
// After clicking RUN → go to Tasks tab → click RUN on each task
// Files appear in Google Drive → Yangon_Thesis folder
// ============================================================

print("=== STARTING ALL EXPORTS ===");
print("Go to Tasks tab and click RUN on each task");

var exports_raster = [
  // ── LST rasters (30m) ──────────────────────────────────────
  {image: full_2023.select("LST"),    name: "LST_2023",         scale: 30},
  {image: full_2019.select("LST"),    name: "LST_2019",         scale: 30},
  {image: full_2015.select("LST"),    name: "LST_2015",         scale: 30},

  // ── UHI and change rasters (30m) ───────────────────────────
  {image: UHI_2023,                   name: "UHI_2023",         scale: 30},
  {image: LST_change_2015_2023,       name: "LST_change_8yr",   scale: 30},
  {image: LST_change_2019_2023,       name: "LST_change_4yr",   scale: 30},
  {image: NDVI_change,                name: "NDVI_change",      scale: 30},

  // ── LULC classifications ────────────────────────────────────
  {image: classified_2023,            name: "LULC_2023",        scale: 10},
  {image: classified_2019,            name: "LULC_2019",        scale: 10},
  {image: classified_2015,            name: "LULC_2015",        scale: 30},

  // ── Vegetation indices 2023 (10m) ──────────────────────────
  {image: s2_2023_idx.select("NDVI"), name: "NDVI_2023",        scale: 10},
  {image: s2_2023_idx.select("EVI"),  name: "EVI_2023",         scale: 10},
  {image: s2_2023_idx.select("NDWI"), name: "NDWI_2023",        scale: 10},
  {image: s2_2023_idx.select("NDBI"), name: "NDBI_2023",        scale: 10},
  {image: s2_2023_idx.select("SAVI"), name: "SAVI_2023",        scale: 10},
  {image: s2_2023_idx.select("BSI"),  name: "BSI_2023",         scale: 10},

  // ── Topography (30m) ────────────────────────────────────────
  {image: elevation,                  name: "DEM",              scale: 30},
  {image: slope,                      name: "Slope",            scale: 30},
];

// Loop through and create all export tasks
exports_raster.forEach(function(exp) {
  Export.image.toDrive({
    image: exp.image.clip(yangon_boundary),
    description: exp.name,
    folder: "Yangon_Thesis",
    fileNamePrefix: exp.name,
    region: yangon_boundary,
    scale: exp.scale,
    crs: "EPSG:32647",       // UTM Zone 47N — correct for Yangon
    maxPixels: 1e13
  });
});

// ── Feature grid export (for Python ML) ──────────────────────
// This is your master ML dataset — 94,411 rows × all features
var feature_stack = full_2023.select("LST")
  .addBands(s2_2023_idx.select("NDVI"))
  .addBands(s2_2023_idx.select("EVI"))
  .addBands(s2_2023_idx.select("NDWI"))
  .addBands(s2_2023_idx.select("NDBI"))
  .addBands(s2_2023_idx.select("SAVI"))
  .addBands(s2_2023_idx.select("BSI"))
  .addBands(elevation.rename("elevation"))
  .addBands(slope.rename("slope"))
  .addBands(dist_to_centre.rename("dist_centre"))
  .addBands(worldpop.rename("population"))
  .addBands(ghsl_built_single);      // single band, already renamed

var sampled = feature_stack.sample({
  region: yangon_boundary,
  scale: 100,
  projection: "EPSG:32647",
  seed: 42,
  geometries: true
});

print("Feature grid points:", sampled.size()); // should be ~94,411

Export.table.toDrive({
  collection: sampled,
  description: "yangon_features_2023_100m",
  folder: "Yangon_Thesis",
  fileNamePrefix: "ML_features_2023",
  fileFormat: "CSV"
});

print("=== ALL EXPORT TASKS CREATED ===");
print("Now click Tasks tab → click RUN on each blue task");
print("Exports take 10-60 minutes each depending on size");
print("All files will appear in Google Drive → Yangon_Thesis folder");
