package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/gorilla/websocket"
)

type Request struct {
	Method string      `json:"method"`
	Value  interface{} `json:"value"`
}

func run() {
	url := "ws://localhost:5665/test_db@12345/users"
	conn, _, err := websocket.DefaultDialer.Dial(url, nil)
	if err != nil {
		log.Fatal("Connection error:", err)
	}
	defer conn.Close()

	go func() {
		for {
			_, message, err := conn.ReadMessage()
			if err != nil {
				log.Println("Read error:", err)
				return
			}
			fmt.Println("Received:", string(message))
		}
	}()

	time.Sleep(1 * time.Second) 
	insertMany(conn)

	select {} 
}

func insertMany(conn *websocket.Conn) {
	request := Request{
		Method: "insertMany",
		Value: []map[string]interface{}{
			{"id": 1, "test": "test", "cool": 1},
			{"id": 2, "test": "test2", "cool": 2},
		},
	}

	message, err := json.Marshal(request)
	if err != nil {
		log.Println("JSON encode error:", err)
		return
	}

	err = conn.WriteMessage(websocket.TextMessage, message)
	if err != nil {
		log.Println("Write error:", err)
	}
}

func main() {
	run()
}