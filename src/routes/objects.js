import {
  fetchAllLDESrecordsObjects,
  fetchLDESRecordByObjectNumber,
  parseBoolean,
} from "../utils/parsers.js";
import { resolver } from "../utils/resolver.js";

export function requestObjects(app) {
  app.get("/id/objects/", async (req, res) => {
    // await data from GET request (supabase)
    const x = await fetchAllLDESrecordsObjects();

    let limit = parseInt(req.query.limit) || 10; // if no limit set, return all items.
    let offset = parseInt(req.query.offset) || 0; // Default offset is 0
    let idOnly = parseBoolean(req.query.idOnly) || false; // if not idOnly, return all items
    let collection = req.query.collection || false


    if (idOnly) {
      //console.log("YES");
    }

    const _objects = [];

    //check if limit exceeds max.
    if (limit >= x.length) {
      limit = x.length;
    }

    if (!limit) {
      limit = x.length;
    }

    //check max offset.
    const maxOffset = x.length / limit;
    if (offset > maxOffset) {
      offset = maxOffset;
    }

    // if collection
    // https://stad.gent/id/concept/530010570
    if (collection) { //todo
    }

    for (let i = 0; i < x.length; i++) {
      let _object = {};
      const baseURI = "https://data.designmuseumgent.be/";

      if (collection) {
          if (x[i]["LDES_raw"]["object"]) {
            _objects.push(x[i]["LDES_raw"]["object"])
          }
      }


      if (!idOnly || !collection ||!dump) {
        _object["@context"] = [
          "https://apidg.gent.be/op…erfgoed-object-ap.jsonld",
          "https://apidg.gent.be/op…xt/generiek-basis.jsonld",
        ];
        _object["@id"] = baseURI + "id/object/" + x[i]["objectNumber"]; // create id (PID) for individual object
        _object["@type"] = "MensgemaaktObject";
        _object["Object.identificator"] = [
          {
            "@type": "Identificator",
            "Identificator.identificator": {
              "@value": x[i]["objectNumber"],
            },
          },
        ];
        _objects.push(_object);
      } else if (idOnly) {
        _objects.push(x[i]["objectNumber"]);
      }
    }
    const objects = _objects.slice(offset, offset + limit);

    // error handling.
    if (objects.length !== 0) {
      res.send(objects);
    } else {
      res.status(503).send("will be available soon!");
    }
  });
}

export function requestObject(app) {
  app.get("/id/object/:objectNumber.:format?", async (req, res, next) => {
    // 1. resolve to special pages
    if (req.params.objectNumber === "removed") {
      res.status(410).json({
        410: "the object is permanently removed from our collection",
      });
    } else {
      // 2. fetch information
      // await data from GET request (supabase)
      const x = await fetchLDESRecordByObjectNumber(req.params.objectNumber);
      const _redirect =
        "https://data.collectie.gent/entity/dmg:" + req.params.objectNumber;
      let _error = "";
      let _manifest = false;
      let _open = false;
      let result_cidoc;

      // define path to resolve to
      if (x[0]["RESOLVES_TO"]) {
        let _route = x[0]["RESOLVES_TO"];
        let _PURL = x[0]["PURI"];

        // resolver
        if (resolver(_PURL, _route, res, req)) {
          result_cidoc = x;
        }
      }

      function parseBoolean(string) {
        return string === "true"
          ? true
          : string === "false"
          ? false
          : undefined;
      }

      // if asked for image, only return manifest link.
      try {
        _manifest = parseBoolean(req.query.manifest) || false;
        _open = parseBoolean(req.query.open) || false;
      } catch (e) {
        console.log(e);
      }

      try {
        // redefine - @id to use URIs and PIDs defined by the museum
        result_cidoc[0]["LDES_raw"]["object"]["@id"] =
          "https://data.designmuseumgent.be/id/object/" +
          req.params.objectNumber;
        // assign foaf:pages
        result_cidoc[0]["LDES_raw"]["object"]["foaf:homepage"] =
          "https://data.designmuseumgent.be/id/object/" +
          req.params.objectNumber;
      } catch (error) {
        _error = error;
      }

      // error handling.
      try {
        if (result_cidoc.length !== 0) {
          req.negotiate(req.params.format, {
            json: function () {
              // if manifest only send manifest;
              if (_manifest && !_open) {
                let _man = result_cidoc["object"];
                res.send(
                  result_cidoc[0]["LDES_raw"]["object"][
                    "http://www.cidoc-crm.org/cidoc-crm/P129i_is_subject_of"
                  ]["@id"],
                );
              } else if (_manifest && _open) {
                res.redirect(
                  result_cidoc[0]["LDES_raw"]["object"][
                    "https://www.cidoc-crm.org/cidoc-crm/P129i_is_subject_of"
                  ]["@id"],
                );
              } else {
                // if format .json redirect to machine-readable page.
                // res.set('Content-Type', 'application/json+ld;charset=utf-8')
                res.send(result_cidoc[0]["LDES_raw"]["object"]);
              }
              //todo: add route to page when not published yet. -- this object has not been published yet.
            },
            html: function () {
              // if format .html redirect to human-readable page
              res.redirect(_redirect);
            },
            default: function () {
              //send html anyway.
              res.redirect(_redirect);
            },
          });
        } else {
          // string is correct / but object can't be found.
          res.status(422).json({
            error:
              "Oops. the syntax of your request is correct, but data on this object has either not yet been published or we are working on repairing this link.",
          });
        }
      } catch (e) {
        res.status(503).send(e);
      }
    }
  });
}
