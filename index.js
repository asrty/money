const { input, text_attr } = require("@saltcorn/markup/tags");
const { features, getState } = require("@saltcorn/data/db/state");
//const db = require("@saltcorn/data/db");
const { sqlBinOp } = require("@saltcorn/data/plugin-helper");

const sql_name_function_allowed = !!sqlBinOp;

const locale = (req) => {
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
      configFields: (field) => {
        return [
          ...(!field?.attributes?.currency
            ? [
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
              options: ["symbol", "code", "narrowSymbol", "name"],
            },
          },
        ];
      },
      isEdit: false,
      run: (v, req, attrs = {}) => {
        const v1 = typeof v === "string" ? +v : v;
        if (typeof v1 === "number") {
          const locale_ = attrs.locale || attrs.format_locale || locale(req) || "en";
          return v1.toLocaleString(locale_, {
            style: attrs.currency ? "currency" : "decimal",
            currency: attrs.currency || undefined,
            currencyDisplay: attrs.currencyDisplay || "symbol",
            maximumFractionDigits: attrs.decimal_points,
          });
        } else return "";
      },
    },
    edit: {
      configFields: () => [
        {
          type: "Bool",
          name: "readonly",
          label: "Readonly",
          sublabel: "Make the field display-only (visualizable), with automatic calculation if formula is provided.",
          default: false,
        },
        {
          input_type: "code",
          attributes: { mode: "application/javascript" },
          class: "validate-statements",
          name: "formula",
          label: "Formula (calculation)",
          sublabel: `JS expression using other fields. Example: strings: value1 * (1 - value2/100) or code: <code>{value1} * {value2} or </code> Leave empty to show own value.`,
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
        {
          input_type: "code",
          attributes: { mode: "text/css" },
          class: "validate-statements",
          name: "csscode",
          label: "CSS code",
          sublabel: `CSS code personalized for {$id}. Example: <code>.{$id} {background-color: transparent;   /* tira o fundo */}</code> Leave blank for default CSS.`,
          validator(s) {
            // Optional: Basic CSS validation can be added if needed, but skipped for simplicity as CSS is forgiving
            return true;
          },
        },
      ],
      isEdit: true,
      run: (nm, v, attrs, cls, required, field) => {
        const id = `input${text_attr(nm)}`;
        const name = text_attr(nm);
        const locale_ = field.attributes.locale || 'en';  // Fixed: Use field.attributes (type attrs), no req needed
        const currency = field.attributes.currency || 'USD';  // Fixed: Consistent with field.attributes
        const decimalPoints = field.attributes.decimal_points || 2;
        const scale = Math.pow(10, decimalPoints);
        const isReadonly = attrs.readonly || false;
        const formula = attrs.formula ? attrs.formula.trim() : '';
        const customCSS = attrs.csscode ? attrs.csscode.trim().replace(/\{\$id\}/g, id) : '';

        let initialValue = '';
        if (v || v === 0) {
          initialValue = v.toLocaleString(locale_, {
            style: 'currency',
            currency,
            maximumFractionDigits: decimalPoints,
            minimumFractionDigits: decimalPoints
          });
        }
        const placeholder = (0).toLocaleString(locale_, { style: 'currency', currency, maximumFractionDigits: decimalPoints });

        const inputType = "text";  // Always text for masking
        const readonlyAttr = isReadonly ? 'readonly="readonly"' : '';

        let html = input({
          type: inputType,
          class: ["form-control", cls, id],
          "data-fieldname": text_attr(field.name),
          name,
          id,
          required: !!required,
          value: text_attr(initialValue),
          placeholder,
          readonly: isReadonly ? true : undefined  // For markup
        });

        // Inject custom CSS if provided
        if (customCSS !== '') {
          html += `<style>${customCSS}</style>`;
        }

        html +=`
          <script>
            const input_${id} = document.getElementById('${id}');
            input_${id}.addEventListener('input', (e) => {
              let value = e.target.value.replace(/\\D/g, '');
              value = (value / ${scale}).toLocaleString('${locale_}', { style: 'currency', currency: '${currency}', maximumFractionDigits: ${decimalPoints} });
              e.target.value = value;
            });
            // Calculation script if formula is provided
            if ('${formula}' !== '') {
            const inputResultado = document.getElementById('${id}');
            function animarInput() {
              inputResultado.classList.remove('animar');
              void inputResultado.offsetWidth; // força o reflow
              inputResultado.classList.add('animar');
            }
              if (!window.moneyCalcInitialized) {
                window.moneyCalcInitialized = true;
                const parseValue = (str) => {
                  if (!str) return 0;
                  let cleaned = str.replace(/[^\\d,.-]/g, '').replace(/\\.(?=.*,)/g, '').replace(/,/g, '.');
                  return parseFloat(cleaned) || 0;
                };
                const updateCalc = () => {
                  let expr = '${formula}';
                  document.querySelectorAll('[data-fieldname]').forEach(inp => {
                    const fname = inp.dataset.fieldname;
                    const val = parseValue(inp.value);
                    expr = expr.replace(new RegExp('\\\\{?' + fname + '\\\\}?', 'g'), val);
                });
                try {
                    const result = eval(expr);
                    inputResultado.value = result.toLocaleString('${locale_}', { style: 'currency', currency: '${currency}', maximumFractionDigits: ${decimalPoints}, minimumFractionDigits: ${decimalPoints} });
                    animarInput();  // Trigger animation on update
                  } catch (e) {
                    inputResultado.value = 'Erro no cálculo';
                  }
                };
                document.querySelectorAll('[data-fieldname]').forEach(inp => inp.addEventListener('input', updateCalc));
                updateCalc();  // Initial calculation
              }
            }
          </script>`;
          return html;
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
      default: "USD",
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