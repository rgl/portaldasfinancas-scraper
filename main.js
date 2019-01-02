"use strict";

const SSO_URL_PREFIX = "https://www.acesso.gov.pt/"
const PERSONAL_DATA_URL = "https://www.portaldasfinancas.gov.pt/pt/main.jsp?body=/external/sgrcsitcad/jsp/sitcadDadosGerais.do";
const REAL_ESTATE_URL = "https://www.portaldasfinancas.gov.pt/pt/Pat/main.jsp?body=/ca/patrimonio.jsp" // PATRIMÓNIO PREDIAL / CADERNETAS

const puppeteer = require("puppeteer");
const fs = require("fs");

// NB 100000002 is a test NIF that should not be assigned to anyone.
// see https://pt.wikipedia.org/wiki/N%C3%BAmero_de_identifica%C3%A7%C3%A3o_fiscal
function isValidNIF(value) {
    const nif = typeof value === "string" ? value : value.toString();
    const validationSets = {
        one: ["1", "2", "3", "5", "6", "8"],
        two: ["45", "70", "71", "72", "74", "75", "77", "79", "90", "91", "98", "99"]
    };

    if (nif.length !== 9) {
        return false;
    }

    if (!validationSets.one.includes(nif.substr(0, 1)) && !validationSets.two.includes(nif.substr(0, 2))) {
        return false;
    }

    let total = nif[0] * 9 + nif[1] * 8 + nif[2] * 7 + nif[3] * 6 + nif[4] * 5 + nif[5] * 4 + nif[6] * 3 + nif[7] * 2;
    let modulo11 = (Number(total) % 11);

    const checkDigit = modulo11 < 2 ? 0 : 11 - modulo11;

    return checkDigit === Number(nif[8]);
}

async function gotoUrl(page, url, credentials) {
    await page.goto(url, {
        waitUntil: "networkidle2"
    });

    // login if needed.
    if ((await page.url()).startsWith(SSO_URL_PREFIX)) {
        await page.type("input#username", credentials.username);
        await page.type("input#password", credentials.password);
        await page.click("button#sbmtLogin");
        // await page.waitForNavigation({
        //     waitUntil: "networkidle2"
        // });
        await page.waitFor(1000); // XXX yeah, this sleep sux... but its needed to make things reliable.
        if ((await page.url()).startsWith(SSO_URL_PREFIX)) {
            const errorMessage = await page.evaluate(() => {
                return document.querySelector(".error-message").innerText;
            });
            throw "failed to login: " + errorMessage;
        }
    }
}

// returns the personal data, e.g.: an object with the following properties:
//      Nome: "XPTO"
//      NIF: "100000002"
//      Sexo: "MASCULINO"
//      Data Nascimento: "1970-01-01"
//      Naturalidade Concelho: "XPTO"
//      Naturalidade Distrito: "XPTO"
//      Naturalidade Freguesia: "XPTO (EXTINTA)"
//      Naturalidade Nacionalidade: "PORTUGUESA"
//      Naturalidade País: "PORTUGAL"
//      Domicílio Fiscal Av. / Rua: "R XPTO"
//      Domicílio Fiscal Concelho: "XPTO"
//      Domicílio Fiscal Código Postal: "1234-567 XPTO"
//      Domicílio Fiscal Data de Produção de Efeitos: "2000-01-01"
//      Domicílio Fiscal Distrito: "XPTO"
//      Domicílio Fiscal Freguesia: "XPTO"
//      Domicílio Fiscal Localidade: "XPTO"
//      Domicílio Fiscal Serv. Finanças Competente: "1234 - XPTO-1"
//      Domicílio Fiscal Território, Região ou País de Residência: "PORTUGAL"
//      Adesão ViaCTT Data Fim: ""
//      Adesão ViaCTT Data Início: ""
async function getPersonalData(page, url, credentials) {
    await gotoUrl(page, url, credentials);
    return await page.evaluate(() => {
        var errorBox = document.querySelector(".redBoxBody");
        if (errorBox) {
            throw "error getting personal data: " + errorBox.innerText;
        }
        var titleElements = document.querySelectorAll(".fieldTitleBold");
        var valueElements = document.querySelectorAll(".fieldValue");
        var valueIndex = -1;
        var prefix = "";
        var properties = {};
        titleElements.forEach((titleElement) => {
            const name = titleElement.innerText;
            if (titleElement.classList.contains("blueBackground")) {
                prefix = name + " ";
            } else {
                properties[prefix+name] = valueElements[++valueIndex].innerText.trim();
            }
        });
        return properties;
    });
}

// returns an array of these objects:
//      {
//          "id": "0",
//          "loc": "1 - UTOPIA",
//          "frg": "1",
//          "tipo": "R",
//          "sec": "XX",
//          "art": "0",
//          "arv": "",
//          "frac": "",
//          "qP": " 1/1",
//          "ano": "1900",
//          "vIni": 123.4,
//          "val": 321.0,
//          "cadR": "S",
//          "map": false,
//          "artM": "R-0-XX-"
//      }
async function getRealEstate(page, url, credentials) {
    await gotoUrl(page, url, credentials);
    const data = await page.evaluate(() => {
        return angular.element($("mainDiv")).scope().predios;
    });
    return data;
}

async function main() {
    if (process.argv.length != 4) {
        throw "you must define the nif and password on the command line"
    }

    // you can test with an unknown user:
    //  var username = "100000002";
    //  var password = "000000000";
    var username = process.argv[2];
    var password = process.argv[3];

    if (!isValidNIF(username)) {
        throw "invalid NIF";
    }

    var credentials = {
        username: username,
        password: password,
    };

    const browser = await puppeteer.launch({
        headless: true
    });
    try {
        const page = await browser.newPage();

        const personalData = await getPersonalData(page, PERSONAL_DATA_URL, credentials);

        const realEstate = await getRealEstate(page, REAL_ESTATE_URL, credentials);
        const data = {
            id: personalData["NIF"],
            name: personalData["Nome"],
            dob: personalData["Data Nascimento"],
            sex: personalData["Sexo"][0],
            data: realEstate.map((i) => {
                return {
                    id: i.id,
                    parish: i.loc,
                    article: i.art,
                    section: i.sec,
                    title: i.artM,
                    part: i.qP.trim(),
                    year: i.ano,
                    initial_value: i.vIni,
                    current_value: i.val,
                };
            }),
        };
        const filename = `real-estate-${credentials.username}.json`;
        console.log(`writing data to ${filename}...`);
        fs.writeFileSync(filename, JSON.stringify(data, null, 4));
    } finally {
        await browser.close();
    }
}

main();
