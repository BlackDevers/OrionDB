/**
 * @ENCODING: UTF-8
 *
 * @UNIX_COMPILATION_COMMAND: g++ -std=c++17 -o websocket_orion websocket_orion.cpp -lpthread
 * @WINDOWS_COMPILATION_COMMAND: cl /std:c++17 /EHsc /Fe:websocket_client.exe websocket_client.cpp ws2_32.lib
 *
 * @AUTHORS: jxbc (original client), borz7zy (code refactor)
 * @DATE: 02-24-2025
 *
 * @LICENSE: MIT
 */

#include <iostream>
#include <string>
#include <thread>
#include <vector>
#include <nlohmann/json.hpp>

#ifdef _WIN32
#include <winsock2.h>
#include <ws2tcpip.h>
#pragma comment(lib, "ws2_32.lib")
#else
#include <sys/types.h>
#include <sys/socket.h>
#include <netdb.h>
#include <unistd.h>
#include <arpa/inet.h>
#endif

using json = nlohmann::json;

class WebSocketClient
{
public:
    WebSocketClient(const std::string &host,
                    const std::string &port,
                    const std::string &path) : host(host),
                                               port(port),
                                               path(path),
                                               running(false)
    {
#ifdef _WIN32
        WSAStartup(MAKEWORD(2, 2), &wsaData);
#endif
    }

    ~WebSocketClient()
    {
        closeSocket();
#ifdef _WIN32
        WSACleanup();
#endif
    }

    bool connect()
    {
        struct addrinfo hints{}, *res;
        hints.ai_family = AF_INET;
        hints.ai_socktype = SOCK_STREAM;

        if (getaddrinfo(host.c_str(), port.c_str(), &hints, &res) != 0)
        {
            std::cerr << "Error: getaddrinfo failed" << std::endl;
            return false;
        }

        sockfd = socket(res->ai_family, res->ai_socktype, res->ai_protocol);
        if (sockfd == -1)
        {
            std::cerr << "Error: Unable to create socket" << std::endl;
            freeaddrinfo(res);
            return false;
        }

        if (::connect(sockfd, res->ai_addr, res->ai_addrlen) == -1)
        {
            std::cerr << "Error: Connection failed" << std::endl;
            closeSocket();
            freeaddrinfo(res);
            return false;
        }
        freeaddrinfo(res);

        if (handshake())
        {
            running = true;
            return true;
        }

        return false;
    }

    void sendMessage(const json &message)
    {
        if (!running || sockfd == -1)
        {
            std::cerr << "Error: Attempt to send on a closed socket" << std::endl;
            return;
        }

        std::string payload = message.dump();
        std::string frame = encodeFrame(payload);
        if (send(sockfd, frame.c_str(), frame.size(), 0) == -1)
        {
            std::cerr << "Error: Failed to send data" << std::endl;
            closeSocket();
            running = false;
        }
    }

    void receiveMessages()
    {
        while (running)
        {
            char buffer[1024] = {0};
            int bytesReceived = recv(sockfd, buffer, sizeof(buffer), 0);

            if (bytesReceived <= 0)
            {
                std::cerr << "Connection closed by server" << std::endl;
                closeSocket();
                running = false;
                break;
            }

            std::string response = decodeFrame(std::string(buffer, bytesReceived));
            std::cout << "Received: " << response << std::endl;
        }
    }

private:
    std::string host, port, path;
    bool running;
    int sockfd;
#ifdef _WIN32
    WSADATA wsaData;
#endif

    void closeSocket()
    {
        if (sockfd != -1)
        {
#ifdef _WIN32
            closesocket(sockfd);
#else
            close(sockfd);
#endif
            sockfd = -1;
            running = false;
        }
    }

    bool handshake()
    {
        std::string request = "GET " + path + " HTTP/1.1\r\n";
        request += "Host: " + host + ":" + port + "\r\n";
        request += "Upgrade: websocket\r\n";
        request += "Connection: Upgrade\r\n";
        request += "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n";
        request += "Sec-WebSocket-Version: 13\r\n\r\n";

        send(sockfd, request.c_str(), request.size(), 0);

        char buffer[1024] = {0};
        recv(sockfd, buffer, sizeof(buffer), 0);
        return std::string(buffer).find("101") != std::string::npos;
    }

    std::string encodeFrame(const std::string &message)
    {
        std::string frame;
        frame.push_back(0x81);
        frame.push_back(message.size());
        frame.append(message);
        return frame;
    }

    std::string decodeFrame(const std::string &frame)
    {
        return frame.substr(2);
    }
};

int main()
{
    WebSocketClient client("localhost", "5665", "/test_db@12345/users");
    if (!client.connect())
        return -1;

    std::thread receiver(&WebSocketClient::receiveMessages, &client);
    std::this_thread::sleep_for(std::chrono::seconds(1));

    json req = {
        {"method", "insertMany"},
        {"value", {{{"id", 1}, {"test", "test"}, {"cool", 1}}, {{"id", 2}, {"test", "test2"}, {"cool", 2}}}}};
    client.sendMessage(req);

    receiver.join();
    return 0;
}
