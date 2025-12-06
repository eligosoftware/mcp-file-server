import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { string, z } from "zod";
import pdf from "pdf-parse";
// import file system modules
import * as fs from "fs/promises";
import * as path from "path";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";
const DOCUMENT_PATH = "C:\\Users\\mragl\\Documents\\claude_mcp_documents"; 
  
// Create server instance
const server = new McpServer({
  name: "weather",
  version: "1.0.0",
  capabilities: {
    resources: {},
    tools: {},
  },
});

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
    const headers = {
      "User-Agent": USER_AGENT,
      Accept: "application/geo+json",
    };
  
    try {
      const response = await fetch(url, { headers });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      console.error("Error making NWS request:", error);
      return null;
    }
  }
  
  interface AlertFeature {
    properties: {
      event?: string;
      areaDesc?: string;
      severity?: string;
      status?: string;
      headline?: string;
    };
  }
  
  // Format alert data
  function formatAlert(feature: AlertFeature): string {
    const props = feature.properties;
    return [
      `Event: ${props.event || "Unknown"}`,
      `Area: ${props.areaDesc || "Unknown"}`,
      `Severity: ${props.severity || "Unknown"}`,
      `Status: ${props.status || "Unknown"}`,
      `Headline: ${props.headline || "No headline"}`,
      "---",
    ].join("\n");
  }
  
  interface ForecastPeriod {
    name?: string;
    temperature?: number;
    temperatureUnit?: string;
    windSpeed?: string;
    windDirection?: string;
    shortForecast?: string;
  }
  
  interface AlertsResponse {
    features: AlertFeature[];
  }
  
  interface PointsResponse {
    properties: {
      forecast?: string;
    };
  }
  
  interface ForecastResponse {
    properties: {
      periods: ForecastPeriod[];
    };
  }

  // Register weather tools
server.tool(
    "get-alerts",
    "Get weather alerts for a state",
    {
      state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
    },
    async ({ state }) => {
      const stateCode = state.toUpperCase();
      const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
      const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);
  
      if (!alertsData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve alerts data",
            },
          ],
        };
      }
  
      const features = alertsData.features || [];
      if (features.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No active alerts for ${stateCode}`,
            },
          ],
        };
      }
  
      const formattedAlerts = features.map(formatAlert);
      const alertsText = `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}`;
  
      return {
        content: [
          {
            type: "text",
            text: alertsText,
          },
        ],
      };
    },
  );
  
  server.tool(
    "get-forecast",
    "Get weather forecast for a location",
    {
      latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
      longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
    },
    async ({ latitude, longitude }) => {
      // Get grid point data
      const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
      const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);
  
      if (!pointsData) {
        return {
          content: [
            {
              type: "text",
              text: `Failed to retrieve grid point data for coordinates: ${latitude}, ${longitude}. This location may not be supported by the NWS API (only US locations are supported).`,
            },
          ],
        };
      }
  
      const forecastUrl = pointsData.properties?.forecast;
      if (!forecastUrl) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to get forecast URL from grid point data",
            },
          ],
        };
      }
  
      // Get forecast data
      const forecastData = await makeNWSRequest<ForecastResponse>(forecastUrl);
      if (!forecastData) {
        return {
          content: [
            {
              type: "text",
              text: "Failed to retrieve forecast data",
            },
          ],
        };
      }
  
      const periods = forecastData.properties?.periods || [];
      if (periods.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No forecast periods available",
            },
          ],
        };
      }
  
      // Format forecast periods
      const formattedForecast = periods.map((period: ForecastPeriod) =>
        [
          `${period.name || "Unknown"}:`,
          `Temperature: ${period.temperature || "Unknown"}°${period.temperatureUnit || "F"}`,
          `Wind: ${period.windSpeed || "Unknown"} ${period.windDirection || ""}`,
          `${period.shortForecast || "No forecast available"}`,
          "---",
        ].join("\n"),
      );
  
      const forecastText = `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`;
  
      return {
        content: [
          {
            type: "text",
            text: forecastText,
          },
        ],
      };
    },
  );

  // adding new tools here

  server.tool(
    // tool endpoint
    "search-pdf-documents",
    // tool description
    "Search PDF documents for relevant information",
    // tool parameters - the minimal length of the query is 1 character
    {
      query: z.string().min(1).describe("Search query to find relevant information in PDF documents"),
    },
    // here goes the function
    async ({ query }) => {

      // it is good idea to put everything in try-catch block
      try {

        // don't forget to import the package 
      // first get all files
      const files = await fs.readdir(DOCUMENT_PATH);
      // then get all pdf files
      const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
      // if no pdf files found, return appropriate message
      if (pdfFiles.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: "No PDF documents found",
            },
          ],
        };
      }

      // some pdf files found, now search through them

      // create an array to hold search results
      const results: string[] = [];
      // convert query to lower case for case-insensitive search
      const queryLower = query.toLowerCase();

      // for each pdf file execute the search
      for (const file of pdfFiles) {

        // each file processing should also be in try-catch block
        // because if the file is corrupted or unreadable, the for block
        // should process the next file

        try {
           // the file path of the file
        const filePath = path.join(DOCUMENT_PATH, file);

        // the contents of the file
        const dataBuffer = await fs.readFile(filePath);

        // create a new pdf object from the data buffer
        const data = await pdf(dataBuffer);

        // extract the text from the pdf
        const text = data.text;

        // if text contains the query, analyze the lines of the text

        if (text.toLowerCase().includes(queryLower)) {

          // split the text into lines
          const lines = text.split('\n');

          // find the matching lines
          const matchingLines = lines.filter(line => line.toLowerCase().includes(queryLower));
          // actually it the same search logic as above

          // if matching lines found, add them to results

          if (matchingLines.length > 0) {
            results.push(
              `\n== ${file} ==\n`+
              `Matches found: ${matchingLines.length}\n`+
              // read the first 5 matching lines
              matchingLines.slice(0, 5).join('\n') +
              // if more than 5 matches, indicate that
              (matchingLines.length > 5 ? `\n...and ${matchingLines.length - 5} more matches.\n` : '')
            );
          }
        }
      }
        catch(fileError){
          console.error(`Error processing file ${file}:`, fileError);
          // continue to the next file
          continue;
        }

       
        }

        // here we return the results

        return {
          content: [
            {
              type: "text",
              text: results.length > 0 ? 
                `Search results for query "${query}" in "${pdfFiles.length}" pdf files:\n` + results.join('\n') :
                `No matches found for query "${query}" in "${pdfFiles.length}" pdf files.`,
            }
          ]};

          // example if found
          // Search results for query "climate" in "3" pdf files:
          //
          // == document1.pdf ==

          // Matches found: 2
          // The climate is changing.
          // Climate change is a global issue.
          //
          // == document2.pdf ==
          // Matches found: 1
          // Climate action is needed now.

          // if no matches found
          // No matches found for query "climate" in "3" pdf files.
      }
    
      catch (error) {
      console.error("Error searching PDF documents:", error);
        return {
          content: [
            {
              type: "text",
              text: "An error occurred while searching PDF documents",
            },
          ],
        };
      }    }
  
    
    );

    // the second tool for listing the documents
    server.tool(
      "list-documents",
      "List all PDF documents available for search",
      // no parameters is needed
      {},
      async () => {
       try{
        const files = await fs.readdir(DOCUMENT_PATH);

        // filter only pdf files
        const pdfFiles = files.filter(file => path.extname(file).toLowerCase() === '.pdf');
        if (pdfFiles.length === 0) {
          return {
            content: [
              {
                type: "text",
                text: "No PDF documents found",
              },
            ],
          };
        }

        // the array of fileInfos
        const fileInfos: string[] = [];

        for (const file of pdfFiles) {
          const filePath = path.join(DOCUMENT_PATH, file);

          try{
            // read the contents of the file

            const dataBuffer = await fs.readFile(filePath);
            // convert to pdf object
            const data = await pdf(dataBuffer);
            // read stats
            const stats = await fs.stat(filePath);

            fileInfos.push(
              `${file}\n`+
              `Pages: ${data.numpages}\n`+
              `Size: ${(stats.size / 1024).toFixed(2)} KB\n`+
              `Preview: ${data.text.substring(0, 100).replace(/\n/g, ' ')}...`
            );

          }
          catch(fileError){
            // again, each file access should be in try-catch block
            // if some error occurs, just log it and continue to the next file
            console.error(`Error accessing file ${file}:`, fileError);
            continue;
          }
        }

        return {
          content: [
            {
              type: "text",
              text: `Available PDF documents (${fileInfos.length}):\n\n` + fileInfos.join('\n\n'),
            }]
        }
      
      }
       catch(error){
        console.error("Error listing documents:", error);

        // i think this is standard response, expected from the MCP server
        return {
          content: [
            {
              type: "text",
              text: "An error occurred while listing documents",
            },
          ],
        };
       } 
      }
    );
    


  async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
  }
  
  main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
  });