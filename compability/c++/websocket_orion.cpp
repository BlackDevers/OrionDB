#include <iostream>
#include <websocketpp/config/asio_no_tls_client.hpp>
#include <websocketpp/client.hpp>
#include <nlohmann/json.hpp>

using json = nlohmann::json;
typedef websocketpp::client<websocketpp::config::asio_client> client;

typedef websocketpp::config::asio_client::message_type::ptr message_ptr;

void on_message(client* c, websocketpp::connection_hdl hdl, message_ptr msg) {
    try {
        json response = json::parse(msg->get_payload());
        std::cout << "Received: " << response.dump(4) << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "Error parsing JSON: " << e.what() << std::endl;
    }
}

void insertMany(client* c, websocketpp::connection_hdl hdl) {
    json req = {
        {"method", "insertMany"},
        {"value", { { {"id", 1}, {"test", "test"}, {"cool", 1} }, 
                     { {"id", 2}, {"test", "test2"}, {"cool", 2} } }}
    };
    
    std::string message = req.dump();
    c->send(hdl, message, websocketpp::frame::opcode::text);
}

void run() {
    client c;
    c.init_asio();
    c.set_message_handler(std::bind(&on_message, &c, std::placeholders::_1, std::placeholders::_2));
    
    websocketpp::lib::error_code ec;
    client::connection_ptr con = c.get_connection("ws://localhost:5665/test_db@12345/users", ec);
    if (ec) {
        std::cerr << "Connection failed: " << ec.message() << std::endl;
        return;
    }
    
    websocketpp::connection_hdl hdl = con->get_handle();
    c.connect(con);
    
    std::thread([&c, hdl]() {
        std::this_thread::sleep_for(std::chrono::seconds(1));
        insertMany(&c, hdl);
    }).detach();
    
    c.run();
}

int main() {
    run();
    return 0;
}