const { input, text_attr, script, domReady, style } = require("@saltcorn/markup/tags");
const { getState } = require("@saltcorn/data/db/state");
const { sqlBinOp } = require("@saltcorn/data/plugin-helper");

const sql_name_function_allowed = !!sqlBinOp;

/**
 * Get the locale from the request or use the default.
 */
const getLocale = (req) => {
  return req && req.getLocale ? req.getLocale() : undefined;
};

/**
 * Setting styles for animating calculated fields.
 
const ANIMATION_STYLES = `
  @keyframes money-pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.02); }
    100% { transform: scale(1); }
  }
  
  .money-calculated.animar {
    animation: money-pulse 0.3s ease-in-out;
    background-color: #e8f5e9 !important;
    transition: background-color 0.3s ease;
  }
  
  .money-calculated {
    transition: background-color 0.3s ease;
  }
`;*/

/**
 * Generates the monetary formatting script in real time.
 */
const generateFormatterScript = (id, locale, currency, decimalPoints) => {
  const scale = Math.pow(10, decimalPoints);
  
  return `
    (function() {
      const input = document.getElementById('${id}');
      if (!input) return;
      
      // Flag para evitar loops infinitos durante a formatação
      let isFormatting = false;
      
      input.addEventListener('input', (e) => {
        if (isFormatting) return;
        isFormatting = true;
        
        try {
          let value = e.target.value.replace(/\\D/g, '');
          
          if (value === '') {
            e.target.value = '';
            return;
          }

          const numValue = value / ${scale};
          e.target.value = numValue.toLocaleString('${locale}', {
            style: 'currency',
            currency: '${currency}',
            minimumFractionDigits: ${decimalPoints},
            maximumFractionDigits: ${decimalPoints}
          });
        } finally {
          isFormatting = false;
        }
      });
      
      // Formata o valor inicial se existir
      if (input.value) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })();
  `;
};

/**
 * Generates the value formatting script in real time.
 */
const generateFormatterScript2 = (id, decimalPoints) => {
  const scale = Math.pow(10, decimalPoints);
  
  return `
    (function() {
      const input = document.getElementById('${id}');
      if (!input) return;
      
      // Flag para evitar loops infinitos durante a formatação
      let isFormatting = false;
      
      input.addEventListener('input', (e) => {
        if (isFormatting) return;
        isFormatting = true;
        
        try {
          let value = e.target.value.replace(/\\D/g, '');
          
          if (value === '') {
            e.target.value = '';
            return;
          }

          const numValue = value / ${scale};
          e.target.value = numValue.toFixed(${decimalPoints}).replace('.', ',');
        } finally {
          isFormatting = false;
        }
      });
      
      // Formata o valor inicial se existir
      if (input.value) {
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    })();
  `;
};

/**
 * Generates the automatic calculation script for fields with formulas.
 */
const generateCalculationScript = (id, formula, locale, currency, decimalPoints) => {
  return `
    (function() {
      if (!window.moneyCalculators) window.moneyCalculators = new Set();
      if (window.moneyCalculators.has('${id}')) return;
      window.moneyCalculators.add('${id}');

      const inputResultado = document.getElementById('${id}');
      if (!inputResultado) return;

      const parseMoneyValue = (str) => {
        if (!str || str === '') return 0;
        let cleaned = str
          .replace(/[^\\d,.-]/g, '')
          .replace(/\\.(?=.*,)/g, '')
          .replace(/,/g, '.');
        return parseFloat(cleaned) || 0;
      };

      const animateField = () => {
        inputResultado.classList.remove('animar');
        void inputResultado.offsetWidth;
        inputResultado.classList.add('animar');
        setTimeout(() => inputResultado.classList.remove('animar'), 300);
      };

      const updateCalc = () => {
        try {
          let expr = \`${formula}\`;
          
          document.querySelectorAll('[data-fieldname]').forEach(inp => {
            const fname = inp.dataset.fieldname;
            const val = parseMoneyValue(inp.value);
            expr = expr.replace(new RegExp('\\\\{?' + fname + '\\\\}?', 'g'), val);
          });

          const result = eval(expr);
          if (isNaN(result) || !isFinite(result)) return;

          const formatted = result.toLocaleString('${locale}', {
            style: 'currency',
            currency: '${currency}',
            minimumFractionDigits: ${decimalPoints},
            maximumFractionDigits: ${decimalPoints}
          });

          if (formatted !== inputResultado.value) {
            inputResultado.value = formatted;
            animateField();
          }
        } catch (error) {
          console.error('Erro no cálculo:', error);
          inputResultado.value = 'Erro no cálculo';
        }
      };

      // Listeners em todos os campos
      document.querySelectorAll('[data-fieldname]').forEach(inp => {
        inp.removeEventListener('input', updateCalc);
        inp.removeEventListener('change', updateCalc);
        inp.addEventListener('input', updateCalc);
        inp.addEventListener('change', updateCalc);
      });

      setTimeout(updateCalc, 100);
    })();
  `;
};

/**
 * Sanitizes and validates custom CSS.
 */
const sanitizeCustomCSS = (css, id) => {
  if (!css || css.trim() === '') return '';
  
  // Replace {$id} with the actual ID of the field.
  let sanitized = css.replace(/\{\$id\}/g, id);
  
  // It adds scope to avoid global conflicts if it doesn't have one.
  if (!sanitized.includes(`.${id}`) && !sanitized.includes(`#${id}`)) {
    sanitized = `.${id} { ${sanitized} }`;
  }
  
  return sanitized;
};

/**
 * Definition of the Money type
 */
const money = {
  name: "Money",
  
  sql_name: sql_name_function_allowed
    ? ({ decimal_points }) =>
        `decimal(${16 + (decimal_points || 2)}, ${+(decimal_points || 2)})`
    : "decimal(18,2)",

  fieldviews: {
    /**
     * Fieldview for display (read-only)
     */
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
          {
            type: "String",
            name: "locale",
            label: "Locale override",
            sublabel: "Optional. Override field locale. Example: pt-BR, en-US",
          },
          // New boolean option - this is what you asked for
          {
            type: "Bool",
            name: "raw_numeric",
            label: "Raw numeric display",
            sublabel: "When checked, shows the pure number without currency symbol, separators or locale formatting (e.g. 1234.56 instead of R$ 1.234,56)",
            default: false,
          },
        ];
      },
      isEdit: false,
      run: (v, req, attrs = {}) => {
        const v1 = typeof v === "string" ? +v : v;
        

        // If raw_numeric is checked → return plain number
        if (attrs.raw_numeric === true) {
          if (v1 == null) return "";
          // Most common choices - pick one:
          return v1.toFixed(field.attributes?.decimal_points || 2).replace('.', ',');                    // exact stored value (recommended)
          // OR: return v1.toFixed(attrs.decimal_points || 2);  // always 2 decimals
          // OR: return v1.toFixed(0);  // integer only
        }

        // Otherwise → original formatted version
        if (typeof v1 === "number") {
          const locale_ = attrs.locale || attrs.format_locale || getLocale(req) || "en";
          const decimalPoints = field.attributes?.decimal_points || 2;
          return v1.toLocaleString(locale_, {
          style: attrs.currency ? "currency" : "decimal",
          currency: attrs.currency || undefined,
          currencyDisplay: attrs.currencyDisplay || "symbol",
          minimumFractionDigits: decimalPoints,
          maximumFractionDigits: decimalPoints,
        });
    } else return "";
  },
},

    /**
     * Fieldview for editing with automatic formatting
     */
    edit: {
      configFields: () => [
        {
          type: "Bool",
          name: "readonly",
          label: "Readonly (Calculated field)",
          sublabel: "Make field display-only. Use with formula for automatic calculation.",
          default: false,
        },
        // New boolean - same as in show
        {
          type: "Bool",
          name: "raw_numeric",
          label: "Raw numeric initial display",
          sublabel: "When checked, shows the pure number without currency symbol, separators or locale formatting in the initial value (e.g. 1234.56 instead of R$ 1.234,56). Masking still works during typing.",
          default: false,
        },
        {
          input_type: "code",
          attributes: { mode: "application/javascript" },
          class: "validate-statements",
          name: "formula",
          label: "Calculation formula",
          sublabel: `JavaScript expression using other field names. Examples:
            • Simple: value1 * value2
            • With braces: {value_total} - {discount}
            • Complex: {price} * {amount} * (1 - {discount_percent}/100)
            Leave empty to show field's own value.`,
          validator(s) {
            if (!s || s.trim() === '') return true;
            
            try {
              // Validate that it is JavaScript.
              new Function(s);
              return true;
            } catch (e) {
              return `Invalid JavaScript: ${e.message}`;
            }
          },
        },
        {
          input_type: "code",
          attributes: { mode: "text/css" },
          name: "csscode",
          label: "Custom CSS",
          sublabel: `Custom CSS for this field. Use {$id} as placeholder for field ID.
            Example: .{$id} { background-color: #f0f0f0; border: 2px solid #ccc; }`,
        },
      ],
      isEdit: true,
      run: (nm, v, attrs, cls, required, field) => {
        const id = `input${text_attr(nm)}`;
        const name = text_attr(nm);
        
        // Retrieves field settings (type attributes)
        const locale_ = field.attributes?.locale || "en";
        const currency = field.attributes?.currency || "USD";
        const decimalPoints = field.attributes?.decimal_points || 2;
        
        // Get fieldview settings (attrs)
        const isReadonly = attrs.readonly || false;
        const isRawNumeric = attrs.raw_numeric || false;
        const formula = attrs.formula ? attrs.formula.trim() : '';
        const customCSS = sanitizeCustomCSS(attrs.csscode, id);
        const hasFormula = formula !== '';
        
        // Format the initial value.
        let initialValue = '';
        if (v !== null && v !== undefined && v !== '') {
          const numValue = typeof v === "string" ? parseFloat(v) : v;
          if (!isNaN(numValue)) {
            if (isRawNumeric) {
              initialValue = numValue.toFixed(decimalPoints).replace('.', ',');
            } else {
              initialValue = numValue.toLocaleString(locale_, {
                style: 'currency',
                currency,
                minimumFractionDigits: decimalPoints,
                maximumFractionDigits: decimalPoints,
              });
            }
          }
        }
        
        const placeholder = isRawNumeric 
          ? (0).toFixed(decimalPoints).replace('.', ',') 
          : (0).toLocaleString(locale_, {
              style: 'currency',
              currency,
              minimumFractionDigits: decimalPoints,
              maximumFractionDigits: decimalPoints,
            });
        
        // Additional CSS classes
        const fieldClasses = [
          "form-control",
          cls,
          id,
          hasFormula ? "money-calculated" : ""
        ].filter(Boolean).join(" ");

        /*const fieldClasses = ["form-control", cls, id];*/
        
        // Generates the HTML for the field.
        let html = input({
          type: "text",
          class: fieldClasses,
          "data-fieldname": text_attr(field.name),
          name,
          id,
          required: !!required,
          value: text_attr(initialValue),
          placeholder,
          readonly: isReadonly ? true : undefined  // For markup
        });
        /*
        // Add animation styles if it's a calculated field.
        if (hasFormula) {
          html += style(ANIMATION_STYLES);
        }*/
        
        // Adds custom CSS if provided.
        if (customCSS) {
          html += style(customCSS);
        }
        
        // Adds formatting and calculation scripts.
        html += script(
          domReady(`
            ${!isReadonly && !hasFormula && !isRawNumeric ? generateFormatterScript(id, locale_, currency, decimalPoints) : ''}
            ${isRawNumeric ? generateFormatterScript2(id, decimalPoints) : ''}
            ${hasFormula && !isRawNumeric ? generateCalculationScript(id, formula, locale_, currency, decimalPoints) : ''}
          `)
        );
        
        return html;
      },
    },
  },

  /**
   * Type attributes (configured when creating the field)
   */
  attributes: [
    {
      label: "Decimal points",
      name: "decimal_points",
      type: "Integer",
      default: 2,
      required: true,
      sublabel: "Number of decimal places (cannot be changed after creation)",
      attributes: { min: 0, max: 6 },
    },
    {
      type: "String",
      name: "currency",
      label: "Currency",
      sublabel: "ISO 4217 currency code. Example: BRL, USD, EUR",
      default: "USD",
      required: true,
    },
    {
      type: "String",
      name: "locale",
      label: "Locale",
      sublabel: "Formatting locale. Example: pt-BR, en-US, es-ES",
      default: "en",
      required: true,
    },
  ],

  /**
   * Converts database value for use in the system.
   */
  readFromDB: (v) => {
    if (v === null || v === undefined) return null;
    return typeof v === "string" ? parseFloat(v) : v;
  },

  /**
   * Process form values ​​before saving to the database.
   */
  read: (v, attrs) => {
    // Null/undefined/empty values
    if (v === null || v === undefined || v === "") {
      return null;
    }
    
    // Is it a number yet?
    if (typeof v === "number") {
      return isNaN(v) ? null : v;
    }
    
    // Formatted string - remove formatting
    if (typeof v === "string") {
      const cleaned = v
        .replace(/[^\d,.-]/g, '')          // Remove everything except digits, commas, dot, and symbols.
        .replace(/\.(?=.*,)/g, '')         // Remove dots if there is a comma (thousands separator).
        .replace(/,/g, '.');               // Converts decimal comma to dot
      
      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    
    return null;
  },
};

module.exports = {
  sc_plugin_api_version: 1,
  types: [money],
  plugin_name: "money",
  description: "Money type with automatic formatting, calculation support, and customizable display",
};