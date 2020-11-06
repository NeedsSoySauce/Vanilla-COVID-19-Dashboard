// This script should be defered or loaded after the document body is loaded

const ORIGIN = 'https://api.covid19api.com';
const COUNTRY_STATUS_ENDPOINT = `${ORIGIN}/total/dayone/country`;
const COUNTRIES_ENDPOINT = `${ORIGIN}/summary`;
const WORLD_ENDPOINT = `${ORIGIN}/summary`;

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

const WORLDWIDE_COUNTRY_CODE = 'WORLDWIDE';
const DEFAULT_COUNTRY_CODE = WORLDWIDE_COUNTRY_CODE;

/**
 * Maps ISO2 codes to a 'slug' used to form URLS to requests data
 *
 * The value of 'WORLDWIDE_COUNTRY_CODE' is a special code that's used if no country is selected
 */
const COUNTRIES = {
    [WORLDWIDE_COUNTRY_CODE]: null
};

const SUMMARY_DATA = {};

const COUNTRY_SELECT = document.querySelector('#country-select');
const CONFIRMED_CASES_CHART_CONTAINER = document.querySelector('#confirmed-cases-chart-container');
const ACTIVE_CASES_CHART_CONTAINER = document.querySelector('#active-cases-chart-container');
const RECOVERED_CHART_CONTAINER = document.querySelector('#recovered-chart-container');
const DEATHS_CHART_CONTAINER = document.querySelector('#deaths-chart-container');

const SUMMARY_CONFIRMED_CASES_TOTAL = document.querySelector('#summary-confirmed-cases-total');
const SUMMARY_ACTIVE_CASES_TOTAL = document.querySelector('#summary-active-cases-total');
const SUMMARY_RECOVERED_TOTAL = document.querySelector('#summary-recovered-total');
const SUMMARY_DEATHS_TOTAL = document.querySelector('#summary-deaths-total');

const SUMMARY_CONFIRMED_CASES_DELTA = document.querySelector('#summary-confirmed-cases-delta');
const SUMMARY_ACTIVE_CASES_DELTA = document.querySelector('#summary-active-cases-delta');
const SUMMARY_RECOVERED_DELTA = document.querySelector('#summary-recovered-delta');
const SUMMARY_DEATHS_DELTA = document.querySelector('#summary-deaths-delta');

const PAGE_LOADING_CONTAINER = document.querySelector('#page-loading-container');
const PAGE_CONTENT = document.querySelector('#page-content');

let pageAbortController = new AbortController();

function getCountryUrl(countryCode) {
    let slug = COUNTRIES[countryCode];
    return `${COUNTRY_STATUS_ENDPOINT}/${slug}`;
}

async function getData(url, fetchOptions = {}) {
    let response = await fetch(url, fetchOptions);

    if (!response.ok) {
        return Promise.reject({ status: response.status });
    }

    return await response.json();
}

function getCovidData(countryCode) {
    let url = WORLD_ENDPOINT;
    if (countryCode !== WORLDWIDE_COUNTRY_CODE) {
        url = getCountryUrl(countryCode);
    }
    return getData(url, {
        signal: pageAbortController.signal
    });
}

async function getCountriesData() {
    return (await getData(COUNTRIES_ENDPOINT)).Countries;
}

function createTextNode(x, y, value, textAnchor = 'middle', dominantBaseline = 'central') {
    let text = document.createElementNS(SVG_NAMESPACE, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', -y);
    text.setAttribute('fill', 'black');
    text.setAttribute('font-size', '12');
    text.setAttribute('text-anchor', textAnchor);
    text.setAttribute('dominant-baseline', dominantBaseline);
    text.style.fontFamily = 'Arial, Helvetica, sans-serif';
    text.textContent = value;
    return text;
}

function createBar(x, y, width, height) {
    let rect = document.createElementNS(SVG_NAMESPACE, 'rect');
    rect.setAttribute('x', x - width / 2);
    rect.setAttribute('y', -y - height);
    rect.setAttribute('width', Math.abs(width));
    rect.setAttribute('height', Math.abs(height));
    rect.setAttribute('fill', 'black');
    rect.classList.add('bar');
    return rect;
}

function createLine(x1, y1, x2, y2, strokeWidth = 1) {
    let line = document.createElementNS(SVG_NAMESPACE, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', -y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', -y2);
    line.setAttribute('stroke', 'black');
    line.setAttribute('stroke-width', strokeWidth);
    return line;
}

/**
 * Returns n equally spaced numbers between start and stop
 */
function linspace(start, stop, n) {
    let arr = [];
    let step = (stop - start) / (n - 1);
    for (let i = 0; i < n; i++) {
        arr.push(start + step * i);
    }
    return arr;
}

/**
 * Returns a function that takes in a single value and maps it to a number
 * between minMapped and maxMapped
 */
function linearScale(minMapped, maxMapped, minValue, maxValue) {
    let scalingFactor = (maxMapped - minMapped) / (maxValue - minValue);
    return (value) => scalingFactor * value;
}

/**
 * Formats a numbers using an SI suffix if needed.
 *
 * Note - only implemented for numbers up to the trillions.
 */
function formatNumber(number, fractionDigits = 1) {
    const suffixes = [
        [1000000000000, 'T'],
        [1000000000, 'B'],
        [1000000, 'M'],
        [1000, 'k']
    ];

    let formatted = +number.toFixed(fractionDigits) + '';

    for (let [suffixValue, suffix] of suffixes) {
        if (number > suffixValue) {
            formatted = +(number / suffixValue).toFixed(fractionDigits) + suffix;
            break;
        }
    }

    return formatted;
}

/**
 * Returns an array representing up to n axis labels for numbers between min
 * and max
 *
 * This won't produce very 'nice' looking labels, but it's sufficient.
 */
function linearAxis(min, max, n) {
    let labels = [];

    let nums = linspace(min, max, n);

    for (let num of nums) {
        labels.push({
            value: num,
            label: formatNumber(num)
        });
    }

    return labels;
}

/**
 * Creates a responsive SVG element containing a bar chart of the given data.
 *
 * Note - there's a limit to how responsive a chart can be. Thought the chart
 * will redraw itself to best-fit the available width, this can result in a
 * chart which is very challenging to read or interact with.
 *
 * @param {Array} x values for horizontal axis
 * @param {Array} y values for vertical axis
 */
function createSvgBarChart({
    x,
    y,
    width,
    height = 600,
    marginLeft = 50,
    marginRight = 30,
    marginBottom = 20,
    marginTop = 20,
    innerChartPadding = 5,
    barPadding = 0.2,
    xLabelOffset = 15,
    xLabelWidth = 20,
    yLabelOffset = 15,
    yLabelCount = 10,
    tickLength = 5
}) {
    if (!x || !y) {
        throw new Error('x and y must have at least one element');
    }

    if (x.length !== y.length) {
        throw new Error('x and y must have the same number of elements');
    }

    let n = x.length;

    let barWidth = (width - marginLeft - marginRight) / n;
    let calculatedBarPadding = (barWidth * barPadding) / 2;
    barWidth -= calculatedBarPadding * 2;

    let svg = document.createElementNS(SVG_NAMESPACE, 'svg');

    // Move origin to bottom-left while accounting for axis margins
    svg.setAttribute('viewBox', `0 ${-height} ${width} ${height}`);
    svg.setAttribute('preserveAspectRatio', `none`);

    // Draw axix lines
    let leftAxisLine = createLine(marginLeft, marginBottom, marginLeft, height - marginTop);
    svg.appendChild(leftAxisLine);

    let bottomAxisLine = createLine(marginLeft, marginBottom, width - marginRight, marginBottom);
    svg.appendChild(bottomAxisLine);

    // Get coords of axis labels
    let xOffset = barWidth / 2 + calculatedBarPadding / 2 + innerChartPadding;
    let xCoords = linspace(marginLeft + xOffset, width - xOffset - marginRight, n);

    // Adjust number of x-axis labels based on how the chart's width
    let xMod = Math.ceil(n / ((width - marginLeft) / xLabelWidth));

    let maxY = Math.max(...y, 1);
    let yScale = linearScale(marginBottom, height - marginTop - marginBottom, 0, maxY);

    // Draw chart
    // Note - we could do this using one loop, but performance isn't a concern
    // and it's easier to read (for me) when things are seperated like this.

    // Draw axis labels and ticks
    xCoords.forEach((xCoord, i) => {
        if (i % xMod !== 0) return;
        let text = createTextNode(xCoord, marginBottom - xLabelOffset, x[i]);
        let line = createLine(xCoord, marginBottom - tickLength, xCoord, marginBottom);

        svg.appendChild(text);
        svg.appendChild(line);
    });

    let yAxisTicks = linearAxis(0, maxY, yLabelCount);
    yAxisTicks.forEach((elem) => {
        let yCoord = yScale(elem.value) + marginBottom;
        let text = createTextNode(marginLeft - yLabelOffset, yCoord, elem.label, 'end');
        let line = createLine(marginLeft, yCoord, marginLeft - tickLength, yCoord);

        svg.appendChild(text);
        svg.appendChild(line);
    });

    // Draw grid lines
    yAxisTicks.forEach((elem) => {
        let yCoord = yScale(elem.value) + marginBottom;
        let line = createLine(marginLeft, yCoord, width - marginRight, yCoord, 0.2);
        svg.appendChild(line);
    });

    // Setup reusable tooltip
    const tooltip = createTextNode(width / 2, height - 10, '');
    svg.appendChild(tooltip);

    // Display info on the last bar the user hovered over
    const tooltipHandler = (label, value) => {
        tooltip.textContent = `${label} - ${localeFormat(value)}`;
    };

    // Draw bars
    xCoords.forEach((xCoord, i) => {
        let bar = createBar(xCoord, marginBottom, barWidth, yScale(y[i]));

        bar.addEventListener('mouseover', () => tooltipHandler(x[i], y[i]));
        bar.addEventListener('touchmove', () => tooltipHandler(x[i], y[i]));

        svg.appendChild(bar);
    });

    return svg;
}

/**
 * Inserts a barchart into the given container element.
 *
 * Returns a cleanup function to remove the ResizeObserver that's used to
 * make the chart responsive (beyond the scaling an SVG provides).
 */
function barChart(x, y, container) {
    let xLabelWidth = Math.max(...x.map((elem) => elem.length)) * 10;

    const update = () => {
        let width = container.getBoundingClientRect().width;
        let chart = createSvgBarChart({ x, y, width, xLabelWidth });
        setChild(container, chart);
    };

    const resizeObserver = new ResizeObserver(debounce(update));
    resizeObserver.observe(container);

    update();

    return () => resizeObserver.disconnect();
}

function setChild(element, child) {
    element.innerHTML = '';
    element.appendChild(child);
}

function localeFormat(number) {
    return number.toLocaleString();
}

function formatNumberWithSign(number, zeroSymbol = '-') {
    if (number === 0) {
        return zeroSymbol;
    }
    return (number > 0 ? '+ ' : '- ') + localeFormat(Math.abs(number));
}

function displaySummaryData(countryCode) {
    let data = SUMMARY_DATA[countryCode];

    SUMMARY_CONFIRMED_CASES_TOTAL.innerText = localeFormat(data.totalConfirmed);
    SUMMARY_ACTIVE_CASES_TOTAL.innerText = localeFormat(data.totalActive);
    SUMMARY_RECOVERED_TOTAL.innerText = localeFormat(data.totalRecovered);
    SUMMARY_DEATHS_TOTAL.innerText = localeFormat(data.totalDeaths);

    SUMMARY_CONFIRMED_CASES_DELTA.innerText = formatNumberWithSign(data.newConfirmed);
    SUMMARY_ACTIVE_CASES_DELTA.innerText = formatNumberWithSign(data.newActive);
    SUMMARY_RECOVERED_DELTA.innerText = formatNumberWithSign(data.newRecovered);
    SUMMARY_DEATHS_DELTA.innerText = formatNumberWithSign(data.newDeaths);
}

function loadStatsWrapper() {
    let cleanUpFunction = null;

    return async (countryCode) => {
        PAGE_LOADING_CONTAINER.style.display = 'flex';
        PAGE_CONTENT.style.display = 'none';

        pageAbortController.abort();
        pageAbortController = new AbortController();

        if (cleanUpFunction) {
            cleanUpFunction();
            cleanUpFunction = null;
        }

        let data;
        try {
            data = await getCovidData(countryCode);
        } catch (e) {
            // If not 429 it's probably an abort error (which isn't really an error)
            if (e.status === 429) {
                // An alert seems suitable here.
                alert('You are being rate limited. Please slow down.');
            }
            return;
        }

        let x = [];
        let yConfirmed = [];
        let yActive = [];
        let yRecovered = [];
        let yDeaths = [];

        if (countryCode === WORLDWIDE_COUNTRY_CODE) {
            let world = data.Global;

            SUMMARY_DATA[WORLDWIDE_COUNTRY_CODE] = {
                totalConfirmed: world.TotalConfirmed,
                totalActive: world.TotalConfirmed - world.TotalRecovered - world.TotalDeaths,
                totalRecovered: world.TotalRecovered,
                totalDeaths: world.TotalDeaths,
                newConfirmed: world.NewConfirmed,
                newActive: world.NewConfirmed - world.NewRecovered - world.NewDeaths,
                newRecovered: world.NewRecovered,
                newDeaths: world.NewDeaths
            };

            for (let country of data.Countries) {
                x.push(country.CountryCode);
                yConfirmed.push(country.TotalConfirmed);
                yActive.push(country.TotalConfirmed - country.TotalRecovered - country.TotalDeaths);
                yRecovered.push(country.TotalRecovered);
                yDeaths.push(country.TotalDeaths);

                SUMMARY_DATA[country.CountryCode] = {
                    totalConfirmed: country.TotalConfirmed,
                    totalActive: country.TotalConfirmed - country.TotalRecovered - country.TotalDeaths,
                    totalRecovered: country.TotalRecovered,
                    totalDeaths: country.TotalDeaths,
                    newConfirmed: country.NewConfirmed,
                    newActive: country.NewConfirmed - country.NewRecovered - country.NewDeaths,
                    newRecovered: country.NewRecovered,
                    newDeaths: country.NewDeaths
                };
            }
        } else {
            let options = { year: 'numeric', month: 'short', day: 'numeric' };
            let df = new Intl.DateTimeFormat('en-NZ', options);

            for (let elem of data) {
                let parts = df.formatToParts(new Date(elem.Date));

                x.push(parts.map((elem) => elem.value).join(''));
                yConfirmed.push(elem.Confirmed);
                yActive.push(elem.Active);
                yRecovered.push(elem.Recovered);
                yDeaths.push(elem.Deaths);
            }
        }

        displaySummaryData(countryCode);

        let cleanUpFunctions = [];
        cleanUpFunctions.push(barChart(x, yConfirmed, CONFIRMED_CASES_CHART_CONTAINER));
        cleanUpFunctions.push(barChart(x, yActive, ACTIVE_CASES_CHART_CONTAINER));
        cleanUpFunctions.push(barChart(x, yRecovered, RECOVERED_CHART_CONTAINER));
        cleanUpFunctions.push(barChart(x, yDeaths, DEATHS_CHART_CONTAINER));

        cleanUpFunction = () => cleanUpFunctions.forEach((func) => func());

        PAGE_LOADING_CONTAINER.style.display = 'none';
        PAGE_CONTENT.style.display = 'block';
    };
}

const loadStats = loadStatsWrapper();

/**
 * Returns a function that only fires if it hasn't been called for delay
 * milliseconds
 *
 * Note: This is a very barebones implementation which does not support
 * passing arguments to the debounced function.
 */
function debounce(func, delay = 100) {
    let timer = null;
    return () => {
        // Restart the timer whenever this is called
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(func, delay);
    };
}

async function configureCountrySelect() {
    let countries = await getCountriesData();

    // Sorted to make it look nicer in the select dropdown
    countries.sort((a, b) => a.Country.localeCompare(b.Country));

    for (let country of countries) {
        COUNTRIES[country.CountryCode] = country.Slug;

        let optionElem = document.createElement('option');
        optionElem.value = country.CountryCode;
        optionElem.innerText = country.Country;

        COUNTRY_SELECT.appendChild(optionElem);
    }

    COUNTRY_SELECT.addEventListener('change', () => {
        loadStats(COUNTRY_SELECT.value);
    });
}

window.addEventListener('DOMContentLoaded', async () => {
    configureCountrySelect();

    loadStats(DEFAULT_COUNTRY_CODE);
});
