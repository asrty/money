const { input, text_attr } = require("@saltcorn/markup/tags");
const { features, getState } = require("@saltcorn/data/db/state");
//const db = require("@saltcorn/data/db");
const { sqlBinOp } = require("@saltcorn/data/plugin-helper");

const sql_name_function_allowed = !!sqlBinOp;

const localeFn = (req) => {
  //console.log(req && req.getLocale ? req.getLocale() : undefined);
  return req && req.getLocale ? req.getLocale() : undefined;
};

const money = {
  name: "Money",
  sql_name: sql_name_function_allowed
    ? ({ decimal_points }) =>
        `decimal(${16 + (decimal_points || 2)}, ${+(decimal_points || 2)})`
    : "decimal(18,2))", //legacy
  fieldviews: {
    show: {
      configFields: (field) => [
        ...(!field?.attributes?.currency ? [
          {
                  type: "String",
                  name: "currency",
                  label: "Currency",
                  sublabel: "Optional. ISO 4217. Example: USD or EUR",
                },
              ]
            : []),
          ...(!field?.attributes?.decimal_points
            ? [
                {
                  label: "Decimal points",
                  name: "decimal_points",
                  type: "Integer",
                  default: 2,
                  required: true,
                  sublabel:
                    "Once set this cannot be changed. Number of fractional decimal points",
                },
              ]
            : []),
          {
            type: "String",
            name: "currencyDisplay",
            label: "Currency display",
            required: true,
            attributes: {
              options: ["symbol", "code", "narrrowSymbol", "name"],
            },
          }, 
          // New field: formula
          {
            input_type: "code",
            attributes: { mode: "application/javascript" },
            class: "validate-statements",
            name: "formula",
            label: "Formula (calculation)",
            sublabel: `JS expression using other fields. Example: strings or <code>{ {valor1} * {valor2} or {total} * (1 - {desconto}/100) }</code> Leave empty to show own value.`,
            validator(s) {
              try {
                let AsyncFunction = Object.getPrototypeOf(
                  async function () {}
                ).constructor;
                AsyncFunction(s);
                return true;
              } catch (e) {
                return e.message;
              }
            },
          },
        ],
        isEdit: false,
        run: (v, req, attrs = {}, field) => {
          const v1 = typeof v === "string" ? +v : v;
          const locale_ = attrs.locale || attrs.format_locale || localeFn(req) || "en";
          const currency = attrs.currency || "BRL";
          const decimalPoints = attrs.decimal_points ?? 2;

          const displayValue = (num) =>
            typeof num === "number" && !isNaN(num)
              ? num.toLocaleString(locale_, {
                  style: "currency",
                  currency,
                  currencyDisplay: attrs.currencyDisplay || "symbol",
                  minimumFractionDigits: decimalPoints,
                  maximumFractionDigits: decimalPoints,
                })
              : "";

          // If no formula → normal display
          if (!attrs.formula || attrs.formula.trim() === "") {
            return displayValue(v1);
          }

          // Container with unique ID for this show field
          const containerId = `money-calc-${field.name}-${Math.random().toString(36).slice(2, 10)}`;

          return div(
            { id: containerId, "data-formula": attrs.formula },
            displayValue(v1) // initial value
          ) + `
            <script>
              // Global calculator - runs once per page
              if (!window.moneyFormulasInitialized) {
                window.moneyFormulasInitialized = true;

                const parseMoney = (str) => {
                  if (!str) return 0;
                  return parseFloat(
                    str
                      .replace(/[^\\d,.-]/g, '')
                      .replace(/\\./g, '')
                      .replace(/,/g, '.')
                  ) || 0;
                };

                const updateCalculations = () => {
                  document.querySelectorAll('[data-formula]').forEach(el => {
                    const formula = el.dataset.formula.trim();
                    if (!formula) return;

                    let expr = formula;

                    // Replace {field_name} with current values
                    document.querySelectorAll('.money-input[data-fieldname]').forEach(input => {
                      const fname = input.dataset.fieldname;
                      const value = parseMoney(input.value);
                      const regex = new RegExp(\`\\\\{\\\\s*\${fname}\\\\s*\\\\}\`, 'g');
                      expr = expr.replace(regex, value);
                    });

                    try {
                      const result = eval(expr); // WARNING: only use in trusted environment!
                      el.textContent = result.toLocaleString('${locale_}', {
                        style: 'currency',
                        currency: '${currency}',
                        minimumFractionDigits: ${decimalPoints},
                        maximumFractionDigits: ${decimalPoints}
                      });
                    } catch (e) {
                      el.textContent = "Erro no cálculo";
                      console.error("Formula error:", e, expr);
                    }
                  });
                };

                // Listen to all money inputs
                document.addEventListener('DOMContentLoaded', () => {
                  document.querySelectorAll('.money-input').forEach(input => {
                    input.addEventListener('input', updateCalculations);
                    input.addEventListener('blur', updateCalculations);
                  });
                  updateCalculations(); // initial run
                });
              }
            </script>`;
        },
      },
    edit: {
      isEdit: true,
      run: (nm, v, attrs, cls, required, field) => {
        const id = `input${text_attr(nm)}`;
        const name = text_attr(nm);
        const locale = field.attributes.locale || locale(req) || 'en';
        const currency = field.attributes.currency || 'USD';
        const decimalPoints = field.attributes.decimal_points || 2;
        const scale = Math.pow(10, decimalPoints);

        let initialValue = '';
        if (v || v === 0) {
          initialValue = v.toLocaleString(locale, {
            style: 'currency',
            currency,
            maximumFractionDigits: decimalPoints,
            minimumFractionDigits: decimalPoints
          });
        }

        return input({
          type: "text",
          class: ["form-control", "money-input", cls],
          "data-fieldname": text_attr(field.name),
          name,
          id,
          required: !!required,
          value: text_attr(initialValue),
          placeholder: (0).toLocaleString(locale, { style: 'currency', currency, maximumFractionDigits: decimalPoints })
        }) + `
          <script>
            const input_${id} = document.getElementById('${id}');
            input_${id}.addEventListener('input', (e) => {
              let value = e.target.value.replace(/\\D/g, '');
              value = (value / ${Math.pow(10, decimalPoints)}).toLocaleString('${locale}', { style: 'currency', currency: '${currency}', maximumFractionDigits: ${decimalPoints} });
              e.target.value = value;
            });
          </script>`;
      },
    },
  },
  attributes: [
    {
      label: "Decimal points",
      name: "decimal_points",
      type: "Integer",
      default: 2,
      required: true,
      sublabel:
        "Once set this cannot be changed. Number of fractional decimal points",
    },
    {
      type: "String",
      name: "currency",
      label: "Currency",
      sublabel: "Optional. ISO 4217. Example: USD or EUR",
    },
    // New locale attribute
    {
      type: "String",
      name: "locale",
      label: "Locale",
      sublabel: "Formatting locale, e.g. pt-BR for Brazilian Portuguese. Defaults to request locale or 'en'.",
      default: "en",
    },
  ],
  readFromDB: (v) => (typeof v === "string" ? +v : v),
  read: (v, attrs) => {
    if (v === null || v === undefined || v === "") return null;
    
    if (typeof v === "number") return v;
    
    if (typeof v === "string") {
      // Remove currency symbols, spaces, and thousand separators
      let cleaned = v
        .replace(/[^\d,.-]/g, '')          // keep only digits, comma, dot, minus
        .replace(/\.(?=.*,)/g, '')         // remove dots if comma is present (thousands)
        .replace(/,/g, '.');               // convert decimal comma to dot
      
      const num = parseFloat(cleaned);
      return isNaN(num) ? undefined : num;
    }
    
    return undefined;
  },
};

module.exports = {
  sc_plugin_api_version: 1,
  types: [money],
  plugin_name: "money",
  /*onLoad() {
    console.log("load");
    db.pool.on("connect", async function (client) {
      // https://github.com/pgvector/pgvector-node/blob/master/src/pg/index.js
      const result = await client.query(
        "SELECT typname, oid, typarray FROM pg_type WHERE typname = $1",
        ["vector"]
      );
      if (result.rowCount < 1) {
        throw new Error("vector type not found in the database");
      }
      const oid = result.rows[0].oid;
      client.setTypeParser(oid, "text", function (value) {
        return JSON.stringify(value);
      });
    });
  },*/
};