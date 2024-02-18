const mysql = require("mysql");
const express = require("express");
const bodyParser = require("body-parser");
const { engine } = require("express-handlebars");
const handlebars = require("handlebars");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const fs = require("fs");
const htmlToPdf = require("html-pdf-node");
const helpers = require("handlebars-helpers")();

handlebars.registerHelper(helpers);

const app = express();
const port = 5000;

app.engine(
  "handlebars",
  engine({
    extname: "handlebars",
    defaultLayout: false,
    layoutsDir: "views/layouts/",
  })
);
app.set("view engine", "handlebars");
app.set("views", "./views");

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

app.use(cookieParser());

app.use(
  cors({
    origin: true,
    credentials: true,
  })
);

const connection = mysql.createConnection({
  user: "root",
  password: "",
  database: "pm_lab_1",
});

connection.connect((err) => {
  if (err) throw err;
  console.log("Connected to MySQL database");
});

function isAdmin(req, res, next) {
  if (req.cookies && req.cookies.authenticated) {
    next();
  } else {
    res
      .status(401)
      .send(
        "Необхідно увійти як адміністратор. <a href='/login'>Перейти на сторінку логіна</a>"
      );
  }
}

app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  if (email === "admin@gmail.com" && password === "1g36~ert") {
    res.cookie("authenticated", true, {
      maxAge: 2 * 365 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      secure: true,
    });
    res.send("Аутентифікація пройшла успішно!");
  } else {
    res.status(401).send("Неправильний email або пароль");
  }
});

app.post("/submit", (req, res) => {
  const formData = JSON.parse(JSON.stringify(req.body));
  delete formData["competitor"];
  delete formData["competitor_advantages"];

  const sql = "INSERT INTO form_data SET ?";
  connection.query(sql, formData, (err, result) => {
    if (err) {
      console.log(err);
      return res.send(err.message);
    }

    const formId = result.insertId;

    const competitors = req.body.competitor;
    const advantages = req.body.competitor_advantages;

    if (competitors && competitors.length > 0) {
      const competitorsValues = competitors.map((comp, index) => [
        formId,
        comp,
        advantages[index],
      ]);
      const competitorsSql =
        "INSERT INTO competitors (form_id, name, advantages) VALUES ?";
      connection.query(competitorsSql, [competitorsValues], (err) => {
        if (err) {
          console.log(err);
          return res.send(err.message);
        }
        console.log("Конкуренти успішно збережені в базі даних");
        res.send("Дані успішно надіслані та збережені в базі даних!");
      });
    } else {
      res.send("Дані успішно надіслані та збережені в базі даних!");
    }
  });
});

app.post("/update", (req, res) => {
  const formData = JSON.parse(JSON.stringify(req.body));
  const formId = formData.id;

  delete formData["competitor"];
  delete formData["competitor_advantages"];

  const deleteCompetitorsSql = "DELETE FROM competitors WHERE form_id = ?";
  connection.query(deleteCompetitorsSql, [formId], (err) => {
    if (err) {
      console.error(err);
      return res.status(500).send(err.message);
    }

    const updateFormDataSql = "UPDATE form_data SET ? WHERE id = ?";
    connection.query(updateFormDataSql, [formData, formId], (err, result) => {
      if (err) {
        console.error(err);
        return res.status(500).send(err.message);
      }

      const competitors = req.body.competitor;
      const advantages = req.body.competitor_advantages;

      if (competitors && competitors.length > 0) {
        const competitorsValues = competitors.map((comp, index) => [
          formId,
          comp,
          advantages[index],
        ]);
        const insertCompetitorsSql =
          "INSERT INTO competitors (form_id, name, advantages) VALUES ?";
        connection.query(insertCompetitorsSql, [competitorsValues], (err) => {
          if (err) {
            console.error(err);
            return res.status(500).send(err.message);
          }
          console.log("Конкуренти успішно оновлені в базі даних");
          res.send("Дані успішно оновлені в базі даних!");
        });
      } else {
        console.log("Дані успішно оновлені в базі даних");
        res.send("Дані успішно оновлені в базі даних!");
      }
    });
  });
});

app.get("/form-list", isAdmin, (req, res) => {
  let sql =
    "SELECT name, email, phone, id, convenient_time, status FROM form_data";

  const { viewed, search, order, "order-type": orderType } = req.query;

  let hasWhere = false;

  if (viewed === "viewed") {
    sql += " WHERE status = 'viewed'";
    hasWhere = true;
  } else if (viewed === "unviewed") {
    sql += " WHERE status = 'unviewed'";
    hasWhere = true;
  }

  if (search) {
    sql += hasWhere ? ` AND` : ` WHERE`;
    sql += ` (name LIKE '%${search}%' OR email LIKE '%${search}%' OR phone LIKE '%${search}%')`;
  }

  if (order) {
    sql += ` ORDER BY ${order} ${orderType ? orderType : "desc"}`;
  }

  connection.query(sql, (error, results) => {
    if (error) {
      console.error("Помилка під час виконання запиту:", error);
      res
        .status(500)
        .send("Сталася помилка під час отримання списку замовлень");
    } else {
      res.render("formList", { forms: results });
    }
  });
});

app.get("/form-view/:id", isAdmin, (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT f.*, c.name AS competitor_name, c.advantages AS competitor_advantages
    FROM form_data f
    LEFT JOIN competitors c ON f.id = c.form_id
    WHERE f.id = ?;
  `;

  const updateFormDataSql = "UPDATE form_data SET ? WHERE id = ?";
  connection.query(
    updateFormDataSql,
    [{ status: "viewed" }, id],
    (err, result) => {}
  );

  connection.query(sql, [id], (err, results) => {
    if (err) {
      console.error("Error fetching form data:", err);
      res.status(500).send("Error fetching form data");
      return;
    }

    if (results.length > 0) {
      const formData = {
        ...results[0],
        competitors: [],
      };

      results.forEach((row) => {
        if (row.competitor_name && row.competitor_advantages) {
          formData.competitors.push({
            name: row.competitor_name,
            advantages: row.competitor_advantages,
          });
        }
      });

      res.render("form-view", formData);
    } else {
      res.status(404).send("Form not found");
    }
  });
});

app.get("/form-pdf/:id", isAdmin, (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT f.*, c.name AS competitor_name, c.advantages AS competitor_advantages
    FROM form_data f
    LEFT JOIN competitors c ON f.id = c.form_id
    WHERE f.id = ?;
  `;
  connection.query(sql, [id], (err, results) => {
    if (err) {
      console.error("Error fetching form data:", err);
      res.status(500).send("Error fetching form data");
      return;
    }

    if (results.length > 0) {
      const formData = {
        ...results[0],
        competitors: [],
      };

      results.forEach((row) => {
        if (row.competitor_name && row.competitor_advantages) {
          formData.competitors.push({
            name: row.competitor_name,
            advantages: row.competitor_advantages,
          });
        }
      });

      const source = fs.readFileSync("views/form-view.handlebars", "utf8");
      const template = handlebars.compile(source);
      const html = template(formData);

      let options = { format: "A4" };
      let file = { content: html };
      htmlToPdf.generatePdf(file, options).then(({ buffer }) => {
        const pdfBuffer = Buffer.from(buffer);
        fs.writeFileSync("form-data.pdf", pdfBuffer);

        res.setHeader("Content-Type", "application/pdf");
        res.download("form-data.pdf");
      });
    } else {
      res.status(404).send("Form not found");
    }
  });
});

app.get("/form-edit/:id", isAdmin, (req, res) => {
  const id = req.params.id;
  const sql = `
    SELECT f.*, c.name AS competitor_name, c.advantages AS competitor_advantages
    FROM form_data f
    LEFT JOIN competitors c ON f.id = c.form_id
    WHERE f.id = ?;
  `;
  connection.query(sql, [id], (err, results) => {
    if (err) {
      console.error("Error fetching form data:", err);
      res.status(500).send("Error fetching form data");
      return;
    }

    if (results.length > 0) {
      const formData = {
        ...results[0],
        competitors: [],
      };

      results.forEach((row) => {
        if (row.competitor_name && row.competitor_advantages) {
          formData.competitors.push({
            name: row.competitor_name,
            advantages: row.competitor_advantages,
          });
        }
      });

      res.render("form-edit", formData);
    } else {
      res.status(404).send("Form not found");
    }
  });
});

app.get("/", (req, res) => {
  res.render("form");
});

app.delete("/delete/:id", (req, res) => {
  const id = req.params.id;

  console.log(id);

  connection.query(
    "DELETE FROM competitors WHERE form_id = ?",
    id,
    (error, results) => {
      if (error) {
        console.error("Помилка при видаленні запису:", error);
        res.status(500).send("Помилка при видаленні запису");
      } else {
        connection.query(
          "DELETE FROM form_data WHERE id = ?",
          id,
          (error, results) => {
            if (error) {
              console.error("Помилка при видаленні запису:", error);
              res.status(500).send("Помилка при видаленні запису");
            } else {
              console.log("Запис успішно видалено");
              res.sendStatus(200);
            }
          }
        );
      }
    }
  );
});

app.listen(port, () => {
  console.log(`Сервер запущено на порті ${port}`);
});
