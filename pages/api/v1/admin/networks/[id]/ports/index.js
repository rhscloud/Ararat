const { connectToDatabase } = require("../../../../../../../util/mongodb");
const { ObjectId } = require("mongodb");
import axios from "axios";
import crypto from "crypto";
import { decode, verify } from "jsonwebtoken";

export default async function handler(req, res) {
    const { method, query: { forwardId: id, id: networkID } } = req;
    switch (method) {
        case "GET":
            var { db } = await connectToDatabase();
            const port = await db.collection("port").findOne({ _id: ObjectId(id) })
            port ? res.send(port) : res.status(404).send("Network Forward does not exist")
            break;
        case "POST":
            if (req.headers["authorization"].split(" ")[1].includes("::")) {

            } else if (req.headers["authorization"].split(" ")[1].includes(":")) {
                try {
                    var token_data = decode(req.headers["authorization"].split(" ")[1].split(":")[1]);
                } catch {
                    return res.status(403).send("Not allowed to access this resource")
                }
                if (!token_data.admin.networks.write) {
                    return res.status(403).send("Not allowed to access this resource")
                }
            } else {
                try {
                    var token_data = decode(req.headers["authorization"].split(" ")[1]);
                } catch {
                    return res.status(403).send("Not allowed to access this resource")
                }
                if (!token_data.admin.networks.write) {
                    return res.status(403).send("Not allowed to access this resource")
                }
            }
            var { db } = await connectToDatabase();
            try {
                var network = await db.collection("networks").findOne({
                    _id: ObjectId(networkID)
                })
            } catch (error) {
                console.log(error);
                return res.status(500).send("An error occured while adding the port")
            }
            try {
                var node = await db.collection("nodes").findOne({
                    _id: ObjectId(network.node)
                })
            } catch (error) {
                console.log(error);
                return res.status(500).send("An error occured while adding the port")
            }
            try {
                var decipher = crypto.createDecipheriv("aes-256-ctr", process.env.ENC_KEY, Buffer.from(node.access_token_iv, "hex"))
                var access_token = Buffer.concat([decipher.update(Buffer.from(node.access_token.split("::")[1], "hex")), decipher.final()])

            } catch (error) {
                console.log(error);
                return res.status(500).send("An error occured while adding the port")
            }
            try {
                console.log(req.body)
                if (req.body.target_type == "instance") {
                    console.log("yes please")
                    let ip;
                    try {
                        ip = await axios.get(`${node.address.ssl ? "https://" : "http://"}${node.address.hostname}:${node.address.port}/api/v1/instances/${req.body.target}/network`, {
                            headers: {
                                "Authorization": `Bearer ${access_token.toString()}`
                            }
                        })
                    } catch (error) {
                        console.log("1 error");
                        return res.status(400).send("The instance has never obtained an IP address. Try powering on the instance then trying again.");
                    }
                    console.log(ip.data)
                    let tempPorts = []
                    req.body.ports.forEach(async port => {
                        console.log(ip.data)
                        if (ip.data.ipv4_address) {
                            port.target_address = ip.data.ipv4_address
                        } else {
                            port.target_address = ip.data.ipv6_address
                        }
                        tempPorts.push(port);
                    })
                    console.log(tempPorts)
                    req.body.ports = tempPorts;
                }
                await axios.put(`${node.address.ssl ? "https" : "http"}://${node.address.hostname}:${node.address.port}/api/v1/network/${networkID}/forwards/ports`, {
                    ports: req.body.ports,
                    listen_address: network.address.ipv4,
                    network: networkID
                }, {
                    headers: {
                        Authorization: `Bearer ${access_token}`
                    }
                })
            } catch (error) {
                console.log(error)
                return res.status(500).send("An error occured")
            }
            try {
                await db.collection("ports").insertOne({
                    "network": networkID,
                    "description": req.body.ports[0].description,
                    "listen_port": req.body.ports[0].listen_port,
                    "protocol": req.body.ports[0].protocol,
                    "target_address": req.body.ports[0].target_address,
                    "target_port": req.body.ports[0].target_port,
                    "meta": {
                        "target_type": req.body.target_type,
                        "target": req.body.target
                    }
                }
                )
            } catch (error) {
                console.log(error)
            }

            return res.status(200).send("success")
            break;
        default:
            break;
    }
}