a https://www.portaldasfinancas.gov.pt/ scraper

# Usage

Scrape your real estate:

```bash
npm install
node main.js 100000002 abracadabra # usage: node main.js <nif> <password>
```

This will generate a JSON file with your real estate, e.g.: the `real-estate-100000002.json` file will contain:

```json
{
    "id": "100000002",
    "name": "JOSÉ MANUEL",
    "dob": "1970-01-01",
    "sex": "M",
    "data": [
        {
            "id": "123",
            "parish": "123 - UNIÃO DAS FREGUESIAS DA UTOPIA",
            "article": "123",
            "section": "",
            "title": "U-123-",
            "part": "1/1",
            "year": "1970",
            "initial_value": 1,
            "current_value": 123.4
        }
    ]
}
```
